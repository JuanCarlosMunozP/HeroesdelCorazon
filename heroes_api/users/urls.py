from django.urls import path

from . import views

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/refresh/", views.RefreshView.as_view(), name="refresh"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("auth/password-change/", views.PasswordChangeView.as_view(), name="password-change"),
    path("auth/password-reset/", views.PasswordResetRequestView.as_view(), name="password-reset"),
    path(
        "auth/password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("users/areas/", views.AreasView.as_view(), name="areas"),
    path("users/import/", views.StaffImportView.as_view(), name="staff-import"),
    path("users/register/", views.RegisterView.as_view(), name="register"),
    path("users/collaborators/", views.CollaboratorsView.as_view(), name="collaborators"),
]
