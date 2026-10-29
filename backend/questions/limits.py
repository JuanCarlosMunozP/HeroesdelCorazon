from django.utils import timezone

from .models import Evaluation, EvaluationSetting, Question


def monthly_limit(evaluation=None):
    """How many colleagues a collaborator can score per month in this evaluation."""
    if evaluation is not None:
        # A per-evaluation value wins; the global EvaluationSetting row is only used when no evaluation is given.
        # Always clamped to 1..MAX so a bad stored value can never block everyone or allow unlimited answers.
        value = evaluation.monthly_limit if evaluation.monthly_limit is not None else EvaluationSetting.DEFAULT_MONTHLY_LIMIT
        return max(1, min(value, EvaluationSetting.MAX_MONTHLY_LIMIT))
    return max(1, min(EvaluationSetting.current().monthly_limit, EvaluationSetting.MAX_MONTHLY_LIMIT))


def month_start():
    """First instant of the current month in local time; the monthly quota window starts here."""
    return timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def scored_this_month(collaborator, evaluation):
    """Ids of the colleagues this collaborator already scored in `evaluation` during the current month.

    Each evaluation has its own quota: a colleague can be scored once per month in every evaluation.
    Reprogramming the evaluation starts a new round, so earlier answers stop counting.
    """
    since = month_start()
    if evaluation.program_started_at and evaluation.program_started_at > since:
        since = evaluation.program_started_at
    return set(
        Question.objects.filter(collaborator=collaborator, evaluation=evaluation, created_at__gte=since)
        .values_list("personal_id", flat=True)
    )


def find_evaluation(raw, open_only=True):
    """The evaluation with that id, or (no id given) the only one there is. None if it cannot be decided."""
    evaluations = Evaluation.objects.available() if open_only else Evaluation.objects.all()
    if raw in (None, ""):
        found = list(evaluations[:2])
        return found[0] if len(found) == 1 else None
    return evaluations.filter(pk=raw).first() if str(raw).isdigit() else None
