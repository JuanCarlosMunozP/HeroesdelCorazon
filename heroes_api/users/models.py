from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

email_validator = RegexValidator(
    regex=r"^[a-zA-Z0-9._%+-]+@demo\.com$",
    message=_("Invalid email, you must use an institutional email."),
)


class User(AbstractUser):
    class Role(models.TextChoices):
        BOSS = "boss", _("Area boss")
        COLLABORATOR = "collaborator", _("Collaborator")

    role = models.CharField(
        _("Role"),
        max_length=20,
        choices=Role.choices,
        default=Role.COLLABORATOR,
    )
    area = models.CharField(_("Area"), max_length=100, blank=True)
    position = models.CharField(_("Position"), max_length=100, blank=True)
    # Optional: people sign in with their ID number (username). Without an email no notifications are sent.
    email = models.EmailField(_("Institutional email"), unique=True, null=True, blank=True, validators=[email_validator])
    first_name = models.CharField(_("First name"), max_length=150)
    last_name = models.CharField(_("Last name"), max_length=150)

    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        verbose_name = _("User")
        verbose_name_plural = _("Users")
        ordering = ["username"]
        indexes = [
            models.Index(fields=["email"], name="user_email_idx"),
        ]

    def save(self, *args, **kwargs):
        self.email = self.email or None  # "" would collide in the unique column
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.username}"
