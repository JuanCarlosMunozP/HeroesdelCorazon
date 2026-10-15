from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from users.models import User

from .limits import find_evaluation, monthly_limit, scored_this_month
from .models import Criterion, Evaluation, Question


class QuestionSerializer(serializers.ModelSerializer):
    personal_name = serializers.CharField(source="personal.get_full_name", read_only=True)

    class Meta:
        model = Question
        fields = ["id", "personal", "personal_name", "area", "category", "criterion", "score", "created_at", "reviewed_at"]


class AnswerSerializer(serializers.Serializer):
    criterion = serializers.CharField()
    score = serializers.IntegerField(min_value=1, max_value=5)


class QuestionCreateSerializer(serializers.Serializer):
    """Full set of answers of one evaluation: one staff member + every criterion of that evaluation.

    Colleagues of the same area only. `evaluation` may be omitted when there is a single open evaluation.
    """

    evaluation = serializers.PrimaryKeyRelatedField(
        queryset=Evaluation.objects.all(), required=False, allow_null=True
    )
    personal = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.COLLABORATOR, is_active=True)
    )
    answers = AnswerSerializer(many=True)

    def validate_personal(self, personal):
        collaborator = self.context["request"].user
        if personal.pk == collaborator.pk:
            raise serializers.ValidationError(_("You cannot evaluate yourself."))
        if collaborator.area and personal.area != collaborator.area:
            raise serializers.ValidationError(_("The collaborator does not belong to your area."))
        return personal

    def validate(self, attrs):
        # Availability depends on today's date, so it is checked here on every request (not when the module loads).
        chosen = attrs.get("evaluation")
        evaluation = find_evaluation(chosen.pk) if chosen else find_evaluation(None)
        if evaluation is None:
            raise serializers.ValidationError({"evaluation": _("Choose an open evaluation.")})
        attrs["evaluation"] = evaluation

        expected = list(Criterion.active(evaluation).values_list("code", flat=True))
        criteria = [a["criterion"] for a in attrs["answers"]]
        if not expected or sorted(criteria) != sorted(expected):
            raise serializers.ValidationError(
                {"answers": _("You must score every criterion of the form, each one only once.")}
            )

        collaborator = self.context["request"].user
        done = scored_this_month(collaborator, evaluation)
        if attrs["personal"].pk in done:
            raise serializers.ValidationError({"personal": _("You already scored this colleague this month.")})
        if len(done) >= monthly_limit(evaluation):
            raise serializers.ValidationError({"personal": _("You reached the monthly limit of colleagues to score.")})
        return attrs

    def create(self, validated_data):
        collaborator = self.context["request"].user
        personal = validated_data["personal"]
        evaluation = validated_data["evaluation"]
        category_of = dict(Criterion.active(evaluation).values_list("code", "category__code"))
        now = timezone.now()
        return Question.objects.bulk_create(
            Question(
                evaluation=evaluation,
                collaborator=collaborator,
                personal=personal,
                area=personal.area,
                category=category_of[a["criterion"]],
                criterion=a["criterion"],
                score=a["score"],
                reviewed_at=now,
            )
            for a in validated_data["answers"]
        )
