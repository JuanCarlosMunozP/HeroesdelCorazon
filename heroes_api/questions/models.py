import calendar

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


def end_of_month(day=None):
    """Last day of the month of `day` (today by default): the closing date every new evaluation gets."""
    day = day or timezone.localdate()
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


class EvaluationQuerySet(models.QuerySet):
    def available(self):
        """The evaluations a collaborator can answer today: open and not past their closing day."""
        today = timezone.localdate()
        return self.filter(is_open=True).filter(models.Q(closes_on__isnull=True) | models.Q(closes_on__gte=today))


class Evaluation(models.Model):
    """An independent evaluation (a named form). The boss can keep one or several open at once.

    Its categories and questions belong only to it: adding a category here never changes another evaluation.
    It can be answered until the end of its closing day (`closes_on`); after that it expires by itself.
    The closing day is set automatically when it is created: the last day of that month.
    """

    name = models.CharField(_("Name"), max_length=150)
    is_open = models.BooleanField(_("Open"), default=True)
    closes_on = models.DateField(_("Closing date"), null=True, blank=True, default=end_of_month)
    created_at = models.DateTimeField(_("Created"), auto_now_add=True)

    objects = EvaluationQuerySet.as_manager()

    @property
    def is_expired(self):
        return self.closes_on is not None and self.closes_on < timezone.localdate()

    @property
    def status(self):
        """open (can be answered), expired (past its closing day) or closed (closed by the boss)."""
        if not self.is_open:
            return "closed"
        return "expired" if self.is_expired else "open"

    class Meta:
        verbose_name = _("Evaluation")
        verbose_name_plural = _("Evaluations")
        ordering = ["id"]

    def __str__(self):
        return self.name


class Category(models.Model):
    """A group of criteria of an evaluation. The boss creates them from the app."""

    evaluation = models.ForeignKey(Evaluation, on_delete=models.PROTECT, related_name="categories")
    code = models.SlugField(_("Code"), max_length=50, unique=True)
    name = models.CharField(_("Name"), max_length=100)
    order = models.PositiveIntegerField(_("Order"), default=0)
    is_active = models.BooleanField(_("Active"), default=True)

    class Meta:
        verbose_name = _("Category")
        verbose_name_plural = _("Categories")
        ordering = ["order", "id"]

    def __str__(self):
        return self.name


class Criterion(models.Model):
    """A question of the form, scored from 1 to 5 by default. Belongs to a category."""

    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="criteria")
    code = models.CharField(_("Code"), max_length=50, unique=True)
    name = models.TextField(_("Question"))
    order = models.PositiveIntegerField(_("Order"), default=0)
    is_active = models.BooleanField(_("Active"), default=True)

    class Meta:
        verbose_name = _("Criterion")
        verbose_name_plural = _("Criteria")
        ordering = ["order", "id"]

    def __str__(self):
        return self.name[:60]

    @classmethod
    def active(cls, evaluation):
        """The criteria that make up the form of `evaluation` today (active, in an active category)."""
        return cls.objects.filter(
            is_active=True, category__is_active=True, category__evaluation=evaluation
        ).select_related("category")


class Question(models.Model):
    """One score (1-5) given by a collaborator to a staff member for a single criterion."""

    evaluation = models.ForeignKey(Evaluation, on_delete=models.PROTECT, related_name="questions")
    collaborator = models.ForeignKey(
        "users.User",
        on_delete=models.PROTECT,
        related_name="questions_given",
        verbose_name=_("Collaborator"),
    )
    personal = models.ForeignKey(
        "users.User",
        on_delete=models.PROTECT,
        related_name="questions_received",
        verbose_name=_("Staff member"),
    )
    area = models.CharField(_("Area"), max_length=100)
    category = models.CharField(_("Category"), null=True, blank=True, max_length=50)
    criterion = models.CharField(_("Criterion"), null=True, blank=True, max_length=50)
    score = models.PositiveSmallIntegerField(
        _("Score"),
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    created_at = models.DateTimeField(_("Date"), auto_now_add=True)
    # Set when the evaluation is sent: it counts right away (the final score is the average of the
    # scores; the boss only consults them and never writes a score).
    reviewed_by = models.ForeignKey(
        "users.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="questions_reviewed",
        verbose_name=_("Reviewed by"),
    )
    reviewed_at = models.DateTimeField(_("Reviewed at"), null=True, blank=True)

    class Meta:
        verbose_name = _("Question")
        verbose_name_plural = _("Questions")

    def __str__(self):
        return f"{self.criterion}: {self.score}"


class EvaluationSetting(models.Model):
    """Single row: how many colleagues each collaborator can score per month (set by the boss)."""

    DEFAULT_MONTHLY_LIMIT = 3
    MAX_MONTHLY_LIMIT = 30

    monthly_limit = models.PositiveSmallIntegerField(_("Monthly limit"), default=DEFAULT_MONTHLY_LIMIT)

    class Meta:
        verbose_name = _("Evaluation setting")
        verbose_name_plural = _("Evaluation settings")

    @classmethod
    def current(cls):
        return cls.objects.get_or_create(pk=1)[0]
