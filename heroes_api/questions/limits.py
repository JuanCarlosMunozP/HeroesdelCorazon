from django.utils import timezone

from .models import Evaluation, EvaluationSetting, Question


def monthly_limit():
    """How many colleagues a collaborator can score per calendar month (the boss sets it)."""
    return min(EvaluationSetting.current().monthly_limit, EvaluationSetting.MAX_MONTHLY_LIMIT)


def month_start():
    return timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def scored_this_month(collaborator, evaluation):
    """Ids of the colleagues this collaborator already scored in `evaluation` during the current month.

    Each evaluation has its own quota: a colleague can be scored once per month in every evaluation.
    """
    return set(
        Question.objects.filter(collaborator=collaborator, evaluation=evaluation, created_at__gte=month_start())
        .values_list("personal_id", flat=True)
    )


def find_evaluation(raw, open_only=True):
    """The evaluation with that id, or (no id given) the only one there is. None if it cannot be decided."""
    evaluations = Evaluation.objects.available() if open_only else Evaluation.objects.all()
    if raw in (None, ""):
        found = list(evaluations[:2])
        return found[0] if len(found) == 1 else None
    return evaluations.filter(pk=raw).first() if str(raw).isdigit() else None
