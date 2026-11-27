"""Sends email through any SMTP server configured in backend/.env.

Without SMTP settings (local development), the email is printed to the server terminal instead,
so features like password reset still work for testing and demos.
"""

import logging
import os
import smtplib
from email.message import EmailMessage

log = logging.getLogger("pawprint")


def smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST"))


def send_email(to: str, subject: str, body: str) -> None:
    if not smtp_configured():
        log.warning("Email not configured (set SMTP_HOST in backend/.env). Would send to %s:\n%s\n%s", to, subject, body)
        return

    msg = EmailMessage()
    msg["From"] = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER", "")
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "587")), timeout=20) as smtp:
            smtp.starttls()
            if os.getenv("SMTP_USER"):
                # Google shows App Passwords as "abcd efgh ijkl mnop"; the spaces aren't part of them.
                password = os.getenv("SMTP_PASSWORD", "").replace(" ", "")
                smtp.login(os.environ["SMTP_USER"].strip(), password)
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError):
        # Runs in the background after the response is sent, so log instead of raising.
        log.exception("Couldn't send email to %s", to)
