import re

from django.core import mail
from rest_framework.test import APITestCase

from .models import User

# All data is fictitious.
PASSWORD = "Demo-Pass-2026"


def create_user(username, role=User.Role.COLLABORATOR, area="Emergency"):
    return User.objects.create_user(
        username=username, email=f"{username}@demo.com", password=PASSWORD,
        first_name="Demo", last_name="Fictional", role=role, area=area,
    )


class AuthTests(APITestCase):
    def setUp(self):
        self.boss = create_user("boss.demo", User.Role.BOSS)

    def test_login_ok_sets_httponly_cookies(self):
        r = self.client.post("/api/v1/auth/login/", {"username": "boss.demo", "password": PASSWORD})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["role"], "boss")
        self.assertTrue(r.cookies["access_token"]["httponly"])
        self.assertTrue(r.cookies["refresh_token"]["httponly"])
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 200)

    def test_invalid_login(self):
        r = self.client.post("/api/v1/auth/login/", {"username": "boss.demo", "password": "wrong"})
        self.assertEqual(r.status_code, 401)

    def test_me_without_session(self):
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)

    def test_cookie_requires_csrf_on_post(self):
        self.client.post("/api/v1/auth/login/", {"username": "boss.demo", "password": PASSWORD})
        self.client.handler.enforce_csrf_checks = True
        r = self.client.post("/api/v1/auth/password-change/", {"new_password": "Other-Pass-2026"})
        self.assertEqual(r.status_code, 403)

    def test_refresh_and_logout(self):
        self.client.post("/api/v1/auth/login/", {"username": "boss.demo", "password": PASSWORD})
        self.assertEqual(self.client.post("/api/v1/auth/refresh/").status_code, 200)
        self.assertEqual(self.client.post("/api/v1/auth/logout/").status_code, 204)
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)

    def test_messages_are_translated_to_spanish(self):
        r = self.client.post("/api/v1/auth/login/", {"username": "boss.demo", "password": "wrong"})
        self.assertEqual(r.data["detail"], "Credenciales inválidas.")


class PasswordRecoveryTests(APITestCase):
    def setUp(self):
        create_user("laura.demo")

    def test_sends_email_with_link_and_allows_reset(self):
        r = self.client.post("/api/v1/auth/password-reset/", {"email": "laura.demo@demo.com"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["laura.demo@demo.com"])

        m = re.search(r"reset-password\?uid=([^&\s]+)&token=(\S+)", mail.outbox[0].body)
        r = self.client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": m.group(1), "token": m.group(2), "new_password": "New-Pass-2026"},
        )
        self.assertEqual(r.status_code, 200)
        r = self.client.post("/api/v1/auth/login/", {"username": "laura.demo", "password": "New-Pass-2026"})
        self.assertEqual(r.status_code, 200)

    def test_unknown_email_reveals_nothing(self):
        r = self.client.post("/api/v1/auth/password-reset/", {"email": "nobody@demo.com"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_invalid_token(self):
        r = self.client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": "MQ", "token": "invalid", "new_password": "New-Pass-2026"},
        )
        self.assertEqual(r.status_code, 400)


class RegisterTests(APITestCase):
    def test_public_sign_up_creates_a_collaborator_and_can_log_in(self):
        create_user("boss.demo", User.Role.BOSS, area="Cardiology")
        self.assertEqual(self.client.get("/api/v1/users/areas/").data, ["Cardiology"])

        body = {
            "username": "nuevo.demo", "email": "nuevo@demo.com", "first_name": "Nuevo", "last_name": "Demo",
            "area": "Cardiology", "position": "Enfermera", "password": "Clave-Nueva-2026", "role": "boss",
        }
        r = self.client.post("/api/v1/users/register/", body)
        self.assertEqual(r.status_code, 201)
        self.assertNotIn("password", r.data)
        self.assertEqual(User.objects.get(username="nuevo.demo").role, "collaborator")  # role cannot be chosen
        r = self.client.post("/api/v1/auth/login/", {"username": "nuevo.demo", "password": "Clave-Nueva-2026"})
        self.assertEqual(r.status_code, 200)

    def test_sign_up_needs_no_email_and_validates_area(self):
        base = {"username": "x.demo", "first_name": "X", "last_name": "Y", "password": "Clave-Nueva-2026", "area": "Nursing", "position": "Enfermera"}
        self.assertEqual(self.client.post("/api/v1/users/register/", {**base, "area": ""}).status_code, 400)
        self.assertEqual(self.client.post("/api/v1/users/register/", {**base, "position": ""}).status_code, 400)
        self.assertEqual(self.client.post("/api/v1/users/register/", base).status_code, 201)
        self.assertIsNone(User.objects.get(username="x.demo").email)
        self.assertEqual(self.client.post("/api/v1/users/register/", {**base, "username": "y.demo"}).status_code, 201)  # two users without email


class StaffImportTests(APITestCase):
    URL = "/api/v1/users/import/"

    def setUp(self):
        self.boss = create_user("boss.demo", User.Role.BOSS)

    def excel(self, rows, header=("Número de documento", "Nombres", "Apellidos", "Área", "Cargo")):
        import io

        from django.core.files.uploadedfile import SimpleUploadedFile
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(list(header))
        for row in rows:
            ws.append(list(row))
        buffer = io.BytesIO()
        wb.save(buffer)
        return SimpleUploadedFile("personal.xlsx", buffer.getvalue())

    def upload(self, rows, **kwargs):
        self.client.force_authenticate(self.boss)
        return self.client.post(self.URL, {"file": self.excel(rows, **kwargs)}, format="multipart")

    def test_loads_staff_and_never_duplicates_a_document(self):
        User.objects.create_user(username="1001", password="x", first_name="Ya", last_name="Existe", role="collaborator")
        r = self.upload([
            (1002, "Ana María", "Pérez", "Sistemas", "Auxiliar"),   # number cell, like Excel stores it
            ("1003", "Luis", "Gómez", "Imagenologia", "Técnico"),
            (1001, "Otro", "Nombre", "Sistemas", "Auxiliar"),       # already in the database
            (1002, "Repetida", "En archivo", "Sistemas", "Auxiliar"),  # repeated inside the file
            (None, None, None, None, None),                          # blank line
            (1004, "Sin", "Area", "", "Auxiliar"),                   # incomplete
        ])
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data["created"], r.data["skipped"]), (2, 2))
        self.assertEqual(r.data["skipped_documents"], ["1001", "1002"])
        self.assertEqual(len(r.data["errors"]), 1)
        self.assertIn("Fila 7", r.data["errors"][0])  # the row number as Excel shows it

        ana = User.objects.get(username="1002")
        self.assertEqual((ana.first_name, ana.last_name, ana.area, ana.position, ana.role), ("Ana María", "Pérez", "Sistemas", "Auxiliar", "collaborator"))
        self.assertTrue(ana.check_password("1002"))  # the document is the first password
        self.assertIsNone(ana.email)
        self.assertEqual(User.objects.get(username="1001").first_name, "Ya")  # the existing user is untouched
        self.assertFalse(User.objects.filter(username="1004").exists())

        again = self.upload([(1002, "Ana María", "Pérez", "Sistemas", "Auxiliar")])
        self.assertEqual((again.data["created"], again.data["skipped"]), (0, 1))

    def test_names_in_one_column_and_header_variants(self):
        r = self.upload([("55", "Juan Pérez", "Sistemas", "Auxiliar")], header=("Cédula", "Nombres", "AREA", "cargo"))
        self.assertEqual((r.status_code, r.data["created"]), (200, 1))

    def test_rejects_bad_files_and_non_bosses(self):
        self.assertEqual(self.upload([(1, "A", "B", "C", "D")], header=("Documento", "Nombres")).status_code, 400)
        self.client.force_authenticate(self.boss)
        self.assertEqual(self.client.post(self.URL, {}, format="multipart").status_code, 400)
        from django.core.files.uploadedfile import SimpleUploadedFile

        bad = SimpleUploadedFile("x.xlsx", b"not an excel")
        self.assertEqual(self.client.post(self.URL, {"file": bad}, format="multipart").status_code, 400)
        self.client.force_authenticate(create_user("c.demo", User.Role.COLLABORATOR))
        self.assertEqual(self.client.post(self.URL, {"file": self.excel([])}, format="multipart").status_code, 403)
