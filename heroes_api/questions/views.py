from django.db import transaction
from django.db.models import Avg, Count
from django.utils.dateparse import parse_date
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsBoss, IsCollaborator
from users.models import User

from .limits import find_evaluation, monthly_limit, scored_this_month
from .models import Category, Evaluation, EvaluationSetting, Question
from .notifications import notify_review
from .serializers import QuestionCreateSerializer, QuestionSerializer


def _avg(value):
    return round(value, 1) if value is not None else None


def _bad(field, message):
    return Response({field: [message]}, status=status.HTTP_400_BAD_REQUEST)


def _approved():
    return Question.objects.filter(reviewed_at__isnull=False)


def _date(value):
    try:
        return parse_date(value or "")
    except ValueError:
        return None


def _in_range(request, qs, field="created_at"):
    """Optional ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD filter (both days included) on `field`."""
    start = _date(request.query_params.get("date_from"))
    end = _date(request.query_params.get("date_to"))
    if start:
        qs = qs.filter(**{f"{field}__date__gte": start})
    if end:
        qs = qs.filter(**{f"{field}__date__lte": end})
    return qs

class QuestionFormView(APIView):
    """Categories and criteria of ONE evaluation (?evaluation=<id>; optional when there is a single open one).

    Only the active ones, unless ?include_inactive=1. The read-only tables (review, results) ask for the
    inactive ones too (and for closed evaluations) to show old evaluations. A collaborator only gets the
    form of an open evaluation to answer it.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        everything = request.query_params.get("include_inactive") == "1"
        open_only = not (everything or request.user.role == User.Role.BOSS)
        evaluation = find_evaluation(request.query_params.get("evaluation"), open_only=open_only)
        if evaluation is None:
            return Response([])

        data = []
        for category in evaluation.categories.prefetch_related("criteria"):
            if not everything and not category.is_active:
                continue
            criteria = [c for c in category.criteria.all() if everything or c.is_active]
            if criteria:
                data.append({
                    "code": category.code,
                    "name": category.name,
                    "criteria": [{"code": c.code, "name": c.name} for c in criteria],
                })
        return Response(data)


class QuestionsView(APIView):
    """GET: the boss sees every score, a collaborator only the approved ones they received.
    POST: a collaborator scores a colleague of their area (12 criteria)."""

    def get_permissions(self):
        return [IsCollaborator()] if self.request.method == "POST" else [IsAuthenticated()]

    def get(self, request):
        qs = Question.objects.select_related("personal").order_by("-created_at", "id")
        if request.user.role != User.Role.BOSS:
            qs = qs.filter(personal=request.user, reviewed_at__isnull=False)
        return Response(QuestionSerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request):
        serializer = QuestionCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        created = serializer.save()
        # The evaluation counts as soon as it is sent: the boss only consults it.
        average = _avg(_approved().filter(personal=created[0].personal).aggregate(a=Avg("score"))["a"])
        transaction.on_commit(lambda: notify_review(created[0].personal, average))
        return Response(QuestionSerializer(created, many=True).data, status=status.HTTP_201_CREATED)


def _grouped(qs):
    """Groups the scores into submissions (collaborator -> staff member, 12 scores), newest first."""
    groups = {}
    for q in qs.select_related("collaborator", "personal", "evaluation").order_by("-created_at", "id"):
        group = groups.setdefault((q.evaluation_id, q.collaborator_id, q.personal_id, q.created_at.date()), {
            "evaluation": q.evaluation_id,
            "evaluation_name": q.evaluation.name,
            "collaborator": q.collaborator_id,
            "collaborator_name": q.collaborator.get_full_name(),
            "personal": q.personal_id,
            "personal_name": q.personal.get_full_name(),
            "area": q.area,
            "created_at": q.created_at,
            "answers": [],
        })
        group["answers"].append({"category": q.category, "criterion": q.criterion, "score": q.score})

    for group in groups.values():
        scores = [a["score"] for a in group["answers"]]
        group["average"] = _avg(sum(scores) / len(scores))
    return list(groups.values())


class SubmissionsView(APIView):
    """Evaluations sent by the collaborators, newest first.

    Read-only for the boss: an evaluation counts as soon as it is sent.
    """

    permission_classes = [IsBoss]

    def get(self, request):
        qs = Question.objects.all()
        if request.user.area:
            qs = qs.filter(personal__area=request.user.area)
        return Response(_grouped(qs))


class SentView(APIView):
    """The evaluations the logged collaborator has sent, newest first."""

    permission_classes = [IsCollaborator]

    def get(self, request):
        return Response(_grouped(Question.objects.filter(collaborator=request.user)))


class ResultsView(APIView):
    """Final score (average of the scores) of the logged user: overall and, for each evaluation, by category."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _approved().filter(personal=request.user)
        by_category = {
            (row["evaluation"], row["category"]): _avg(row["a"])
            for row in qs.values("evaluation", "category").annotate(a=Avg("score"))
        }
        by_evaluation = {row["evaluation"]: _avg(row["a"]) for row in qs.values("evaluation").annotate(a=Avg("score"))}

        evaluations = []
        for evaluation in Evaluation.objects.filter(pk__in=by_evaluation):
            evaluations.append({
                "id": evaluation.pk,
                "name": evaluation.name,
                "average": by_evaluation[evaluation.pk],
                "by_category": [
                    {"code": c.code, "name": c.name, "average": by_category[(evaluation.pk, c.code)]}
                    for c in evaluation.categories.all() if (evaluation.pk, c.code) in by_category
                ],
            })
        return Response({
            "average": _avg(qs.aggregate(a=Avg("score"))["a"]),
            "evaluations": evaluations,
        })


class ResultsSummaryView(APIView):
    """Boss: what each person obtained in ONE evaluation (?evaluation=<id>): average by category and overall.

    Without ?evaluation it uses the first evaluation that has answers. The boss of an area only sees people of it.
    """

    permission_classes = [IsBoss]

    def get(self, request):
        evaluations = Evaluation.objects.all()
        raw = request.query_params.get("evaluation")
        if raw:
            evaluation = evaluations.filter(pk=raw).first() if raw.isdigit() else None
        else:
            evaluation = evaluations.filter(questions__isnull=False).distinct().first() or evaluations.first()
        if evaluation is None:
            return Response({"evaluation": None, "categories": [], "rows": []})

        qs = _approved().filter(evaluation=evaluation)
        if request.user.area:
            qs = qs.filter(personal__area=request.user.area)

        scores = {}
        for row in qs.values("personal", "category").annotate(a=Avg("score")):
            scores.setdefault(row["personal"], {})[row["category"]] = _avg(row["a"])
        overall = {row["personal"]: _avg(row["a"]) for row in qs.values("personal").annotate(a=Avg("score"))}

        people = User.objects.filter(pk__in=overall).order_by("first_name", "last_name")
        return Response({
            "evaluation": {"id": evaluation.pk, "name": evaluation.name},
            "categories": [{"code": c.code, "name": c.name} for c in evaluation.categories.all()],
            "rows": [
                {
                    "personal": p.pk,
                    "name": p.get_full_name(),
                    "area": p.area,
                    "position": p.position,
                    "by_category": scores.get(p.pk, {}),
                    "average": overall[p.pk],
                }
                for p in people
            ],
        })


class CategoryAveragesView(APIView):
    """Boss: average of the scores by category, for one person (?personal=<id>) and/or one evaluation
    (?evaluation=<id>); without them, for everyone and every evaluation."""

    permission_classes = [IsBoss]

    def get(self, request):
        qs = _approved()
        if request.user.area:
            qs = qs.filter(personal__area=request.user.area)
        personal = request.query_params.get("personal")
        if personal:
            qs = qs.filter(personal_id=personal) if personal.isdigit() else qs.none()
        categories = Category.objects.all()
        evaluation = request.query_params.get("evaluation")
        if evaluation:
            valid = evaluation.isdigit()
            qs = qs.filter(evaluation_id=evaluation) if valid else qs.none()
            categories = categories.filter(evaluation_id=evaluation) if valid else categories.none()

        by_category = {row["category"]: _avg(row["a"]) for row in qs.values("category").annotate(a=Avg("score"))}
        return Response({
            "average": _avg(qs.aggregate(a=Avg("score"))["a"]),
            "by_category": [
                {"code": c.code, "name": c.name, "average": by_category.get(c.code)}
                for c in categories
                if c.is_active or c.code in by_category
            ],
        })


class StatsView(APIView):
    """Count of evaluated (approved) vs pending collaborators, total and per area, for the dashboard."""

    permission_classes = [IsBoss]

    def get(self, request):
        collaborators = User.objects.filter(role=User.Role.COLLABORATOR, is_active=True)
        if request.user.area:
            collaborators = collaborators.filter(area=request.user.area)

        evaluated_ids = set(
            _in_range(request, _approved()).filter(personal__in=collaborators).values_list("personal_id", flat=True)
        )
        by_area = {}
        for pk, area in collaborators.values_list("pk", "area"):
            name = area or "-"
            row = by_area.setdefault(name, {"area": name, "evaluated": 0, "pending": 0})
            row["evaluated" if pk in evaluated_ids else "pending"] += 1

        total = collaborators.count()
        return Response({
            "total": total,
            "evaluated": len(evaluated_ids),
            "pending": total - len(evaluated_ids),
            "by_area": sorted(by_area.values(), key=lambda r: r["area"]),
        })


class SettingsView(APIView):
    """Boss: reads and sets a monthly colleague limit globally or for one evaluation."""

    permission_classes = [IsBoss]

    def get(self, request):
        raw = request.query_params.get("evaluation")
        evaluation = Evaluation.objects.filter(pk=raw).first() if raw and raw.isdigit() else None
        if raw and evaluation is None:
            return _bad("evaluation", _("Choose an evaluation."))
        data = {"monthly_limit": monthly_limit(evaluation)}
        if evaluation:
            data["evaluation"] = evaluation.pk
        return Response(data)

    def put(self, request):
        raw = request.data.get("evaluation", request.query_params.get("evaluation"))
        evaluation = Evaluation.objects.filter(pk=raw).first() if raw and str(raw).isdigit() else None
        if raw and evaluation is None:
            return _bad("evaluation", _("Choose an evaluation."))
        try:
            value = int(request.data.get("monthly_limit"))
        except (TypeError, ValueError):
            value = 0
        if not 1 <= value <= EvaluationSetting.MAX_MONTHLY_LIMIT:
            return Response(
                {"monthly_limit": [_("Enter a whole number between 1 and %(max)s.") % {"max": EvaluationSetting.MAX_MONTHLY_LIMIT}]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if evaluation:
            evaluation.monthly_limit = value
            evaluation.save(update_fields=["monthly_limit"])
        else:
            setting = EvaluationSetting.current()
            setting.monthly_limit = value
            setting.save(update_fields=["monthly_limit"])
        data = {"monthly_limit": value}
        if evaluation:
            data["evaluation"] = evaluation.pk
        return Response(data)


class QuotaView(APIView):
    """How many colleagues the collaborator can still score this month in an evaluation (?evaluation=<id>),
    and who was already scored."""

    permission_classes = [IsCollaborator]

    def get(self, request):
        evaluation = find_evaluation(request.query_params.get("evaluation"))
        done = scored_this_month(request.user, evaluation) if evaluation else set()
        return Response({
            "evaluation": evaluation.pk if evaluation else None,
            "limit": monthly_limit(evaluation),
            "used": len(done),
            "personal": sorted(done),
        })


class DashboardView(APIView):
    """Staff and evaluated-people counts (per area and overall) for the dashboard of both roles.

    evaluated = distinct people who already have an evaluation (a score reviewed by the boss).
    Optional ?date_from / ?date_to (YYYY-MM-DD): the evaluations are the ones sent in that range and
    the staff are the users registered in that range.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        staff = {}
        users = _in_range(request, User.objects.filter(is_active=True), field="date_joined")
        for row in users.values("area").annotate(n=Count("id")):
            staff[row["area"] or "-"] = row["n"]

        evaluated = {}
        for row in _in_range(request, _approved()).values("area").annotate(n=Count("personal", distinct=True)):
            evaluated[row["area"] or "-"] = row["n"]

        areas = sorted(set(staff) | set(evaluated))
        by_area = [
            {"area": area, "staff": staff.get(area, 0), "evaluated": evaluated.get(area, 0)}
            for area in areas
        ]
        total_evaluated = _in_range(request, _approved()).values("personal").distinct().count()
        return Response({
            "staff": sum(staff.values()),
            "areas": len([a for a in areas if a != "-"]),
            "evaluated": total_evaluated,
            "by_area": by_area,
        })
