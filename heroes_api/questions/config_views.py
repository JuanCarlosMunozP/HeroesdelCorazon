"""Boss-only management of the evaluations: each one has its own categories and their criteria (questions).

Every criterion is scored from 1 to 5 (the scale is fixed). A category or criterion that already has
scores cannot be deleted (it would break the history): it is deactivated and leaves the new forms.
"""

from django.db import transaction
from django.db.models import Max
from django.utils.text import slugify
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsBoss
from users.models import User

from .models import Category, Criterion, Evaluation, Question
from .staff_import import AnswersFileError, import_answers, read_table


def _unique(model, field, base, limit):
    """`base` slug, with a number appended if it is already taken."""
    base = (slugify(base) or "item")[:limit - 6]
    value, n = base, 1
    while model.objects.filter(**{field: value}).exists():
        n += 1
        value = f"{base}-{n}"
    return value


def _clean(value):
    return " ".join(str(value or "").split())


def _next_order(model, **filters):
    return (model.objects.filter(**filters).aggregate(m=Max("order"))["m"] or 0) + 1


def _listing(evaluation):
    """The categories (with their criteria) of one evaluation."""
    used_criteria = set(Question.objects.filter(evaluation=evaluation).values_list("criterion", flat=True).distinct())
    used_categories = set(Question.objects.filter(evaluation=evaluation).values_list("category", flat=True).distinct())
    return [
        {
            "id": category.pk,
            "code": category.code,
            "name": category.name,
            "is_active": category.is_active,
            "used": category.code in used_categories,
            "criteria": [
                {"id": c.pk, "code": c.code, "name": c.name, "is_active": c.is_active, "used": c.code in used_criteria}
                for c in category.criteria.all()
            ],
        }
        for category in evaluation.categories.prefetch_related("criteria")
    ]


def _evaluation_data(evaluation):
    answers = evaluation.questions.values("collaborator", "personal", "created_at__date").distinct().count()
    return {
        "id": evaluation.pk,
        "name": evaluation.name,
        "is_open": evaluation.is_open,
        "closes_on": evaluation.closes_on.isoformat() if evaluation.closes_on else None,
        "status": evaluation.status,
        "answers": answers,
        "used": evaluation.questions.exists(),
        "categories": evaluation.categories.count(),
        "criteria": Criterion.objects.filter(category__evaluation=evaluation, is_active=True).count(),
    }


def _locked(evaluation):
    """Error response when `evaluation` already has answers: its form is fixed, new questions go to a new evaluation."""
    if not evaluation.questions.exists():
        return None
    return Response(
        {"detail": _("This evaluation already has answers: create a new evaluation to add categories or questions.")},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _evaluation_of(raw):
    return Evaluation.objects.filter(pk=raw).first() if str(raw or "").isdigit() else None


def _bad(field, message):
    return Response({field: [message]}, status=status.HTTP_400_BAD_REQUEST)


def _apply_changes(obj, data, evaluation):
    """Applies the optional `name` / `is_active` of a PATCH. Returns an error response or None.

    Turning a category/question ON adds it to the form, and the form is fixed once the evaluation has answers.
    """
    if data.get("is_active") and (locked := _locked(evaluation)):
        return locked
    if "name" in data:
        name = _clean(data["name"])
        if not name:
            return _bad("name", _("Enter a name."))
        obj.name = name
    if "is_active" in data:
        obj.is_active = bool(data["is_active"])
    obj.save()
    return None


class EvaluationsView(APIView):
    """GET: the evaluations (the boss sees every one; a collaborator only the open ones).
    POST (boss): creates a new, empty and independent evaluation: {"name": "..."}."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        evaluations = Evaluation.objects.all()
        if request.user.role != User.Role.BOSS:
            evaluations = evaluations.available()
        return Response([_evaluation_data(e) for e in evaluations])

    def post(self, request):
        if request.user.role != User.Role.BOSS:
            return Response(status=status.HTTP_403_FORBIDDEN)
        name = _clean(request.data.get("name"))
        if not name:
            return _bad("name", _("Enter a name."))
        evaluation = Evaluation.objects.create(name=name)  # closes at the end of this month, automatically
        return Response(_evaluation_data(evaluation), status=status.HTTP_201_CREATED)


class EvaluationDetailView(APIView):
    """PATCH {name?, is_open?} (open or close) or DELETE (only while it has no answers)."""

    permission_classes = [IsBoss]

    def patch(self, request, pk):
        evaluation = Evaluation.objects.filter(pk=pk).first()
        if evaluation is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if "name" in request.data:
            name = _clean(request.data["name"])
            if not name:
                return _bad("name", _("Enter a name."))
            evaluation.name = name
        if "is_open" in request.data:
            evaluation.is_open = bool(request.data["is_open"])
        evaluation.save()
        return Response(_evaluation_data(evaluation))

    @transaction.atomic
    def delete(self, request, pk):
        evaluation = Evaluation.objects.filter(pk=pk).first()
        if evaluation is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if evaluation.questions.exists():
            return Response(
                {"detail": _("This evaluation has answers: close it instead of deleting it.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        Criterion.objects.filter(category__evaluation=evaluation).delete()
        evaluation.categories.all().delete()
        evaluation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CategoriesView(APIView):
    """GET ?evaluation=<id>: the categories of that evaluation with their criteria (and whether they already
    have scores). POST: creates a category together with its criteria, inside ONE evaluation:
    {"evaluation": 1, "name": "...", "criteria": ["question 1", "question 2"]}. Other evaluations are untouched."""

    permission_classes = [IsBoss]

    def get(self, request):
        evaluation = _evaluation_of(request.query_params.get("evaluation"))
        if evaluation is None:
            return _bad("evaluation", _("Choose an evaluation."))
        return Response(_listing(evaluation))

    @transaction.atomic
    def post(self, request):
        evaluation = _evaluation_of(request.data.get("evaluation"))
        if evaluation is None:
            return _bad("evaluation", _("Choose an evaluation."))
        if locked := _locked(evaluation):
            return locked
        name = _clean(request.data.get("name"))
        raw = request.data.get("criteria")
        questions = [_clean(q) for q in raw] if isinstance(raw, list) else []
        questions = [q for q in questions if q]
        if not name:
            return _bad("name", _("Enter a name."))
        if not questions:
            return _bad("criteria", _("Add at least one question to the category."))

        category = Category.objects.create(
            evaluation=evaluation,
            name=name,
            code=_unique(Category, "code", name, 50),
            order=_next_order(Category, evaluation=evaluation),
        )
        for number, text in enumerate(questions, start=1):
            Criterion.objects.create(
                category=category, name=text, order=number, code=_unique(Criterion, "code", text, 50)
            )
        return Response(_listing(evaluation), status=status.HTTP_201_CREATED)


class CategoryDetailView(APIView):
    """PATCH {name?, is_active?} or DELETE (only while it has no scores)."""

    permission_classes = [IsBoss]

    def patch(self, request, pk):
        category = Category.objects.filter(pk=pk).first()
        if category is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return _apply_changes(category, request.data, category.evaluation) or Response(_listing(category.evaluation))

    @transaction.atomic
    def delete(self, request, pk):
        category = Category.objects.filter(pk=pk).first()
        if category is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if Question.objects.filter(category=category.code).exists():
            return Response(
                {"detail": _("This category has evaluations: deactivate it instead of deleting it.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        evaluation = category.evaluation
        category.criteria.all().delete()
        category.delete()
        return Response(_listing(evaluation))


class CategoryCriteriaView(APIView):
    """POST {name}: adds a question to the category."""

    permission_classes = [IsBoss]

    def post(self, request, pk):
        category = Category.objects.filter(pk=pk).first()
        if category is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if locked := _locked(category.evaluation):
            return locked
        text = _clean(request.data.get("name"))
        if not text:
            return _bad("name", _("Enter a name."))
        Criterion.objects.create(
            category=category,
            name=text,
            code=_unique(Criterion, "code", text, 50),
            order=_next_order(Criterion, category=category),
        )
        return Response(_listing(category.evaluation), status=status.HTTP_201_CREATED)


class CriterionDetailView(APIView):
    """PATCH {name?, is_active?} or DELETE (only while it has no scores)."""

    permission_classes = [IsBoss]

    def patch(self, request, pk):
        criterion = Criterion.objects.filter(pk=pk).first()
        if criterion is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return _apply_changes(criterion, request.data, criterion.category.evaluation) or Response(_listing(criterion.category.evaluation))

    def delete(self, request, pk):
        criterion = Criterion.objects.filter(pk=pk).first()
        if criterion is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if Question.objects.filter(criterion=criterion.code).exists():
            return Response(
                {"detail": _("This question has evaluations: deactivate it instead of deleting it.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        evaluation = criterion.category.evaluation
        criterion.delete()
        return Response(_listing(evaluation))


class AnswersImportView(APIView):
    """Boss: uploads an Excel (.xlsx) or CSV with answers (see questions/staff_import.py for the columns).

    Optional form field `evaluation` (id): the evaluation of the rows that do not say which one they belong to.
    Pairs that already have answers in their evaluation are skipped, never duplicated.
    """

    permission_classes = [IsBoss]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get("file")
        if file is None:
            return _bad("file", _("Attach an Excel (.xlsx) or CSV file."))
        default = None
        if request.data.get("evaluation"):
            default = _evaluation_of(request.data.get("evaluation"))
            if default is None:
                return _bad("evaluation", _("Choose an evaluation."))
        try:
            table = read_table(file, file.name)
            with transaction.atomic():
                result = import_answers(table, default)
        except AnswersFileError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
