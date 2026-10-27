import os
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import httpx

logger = logging.getLogger("voice_agent.mailer")

RECEPTIONIST_EMAIL_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Appointment Request</title>
</head>
<body style="margin: 0; padding: 30px 15px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    
    <!-- Clinic Brand Header -->
    <div style="background: linear-gradient(135deg, #0f766e 0%, #115e59 100%); padding: 24px 28px; color: #ffffff;">
      <h2 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">Happy Harmony Physiotherapy & Spine Clinic</h2>
      <p style="margin: 0; font-size: 13px; color: #ccfbf1; font-weight: 500;">Automated Front-Desk Intake Alert</p>
    </div>

    <!-- Main Content -->
    <div style="padding: 28px;">
      
      <!-- Status Badge -->
      <div style="display: inline-block; background-color: #fef3c7; color: #92400e; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 20px; border: 1px solid #fde68a;">
        🔔 Callback Required
      </div>

      <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155; line-height: 1.5;">
        A new appointment request was just taken over the phone. Please review the patient's information below and call back to confirm the slot.
      </p>

      <!-- Details Table -->
      <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 24px;">
        <tbody>
          <tr>
            <td style="padding: 14px 18px; font-size: 13px; color: #64748b; font-weight: 600; width: 38%; border-bottom: 1px solid #e2e8f0;">Patient Name</td>
            <td style="padding: 14px 18px; font-size: 14px; color: #0f172a; font-weight: 700; border-bottom: 1px solid #e2e8f0;">{{PATIENT_NAME}}</td>
          </tr>
          <tr>
            <td style="padding: 14px 18px; font-size: 13px; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Phone Number</td>
            <td style="padding: 14px 18px; font-size: 14px; color: #0f766e; font-weight: 700; border-bottom: 1px solid #e2e8f0;">
              <a href="tel:{{PATIENT_PHONE}}" style="color: #0f766e; text-decoration: none;">{{PATIENT_PHONE}}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 14px 18px; font-size: 13px; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Requested Date & Time</td>
            <td style="padding: 14px 18px; font-size: 14px; color: #0f172a; font-weight: 700; border-bottom: 1px solid #e2e8f0;">{{APPOINTMENT_DAY}}, {{APPOINTMENT_DATE}} at {{APPOINTMENT_TIME}}</td>
          </tr>
          <tr>
            <td style="padding: 14px 18px; font-size: 13px; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Area of Concern</td>
            <td style="padding: 14px 18px; font-size: 14px; color: #334155; font-weight: 500; border-bottom: 1px solid #e2e8f0;">{{AREA_OF_CONCERN}}</td>
          </tr>
          <tr>
            <td style="padding: 14px 18px; font-size: 13px; color: #64748b; font-weight: 600;">Insurance Provider</td>
            <td style="padding: 14px 18px; font-size: 14px; color: #334155; font-weight: 500;">{{INSURANCE_COMPANY}}</td>
          </tr>
        </tbody>
      </table>

      <!-- Receptionist Quick Action Note -->
      <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #065f46; line-height: 1.4;">
        <strong>Front-Desk Action:</strong> Please contact the patient at the number above to verify their details and finalize this appointment in the clinic schedule.
      </div>

    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; padding: 16px 28px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
      Happy Harmony Physiotherapy & Spine Rehabilitation Clinic &bull; Automated Intake System
    </div>

  </div>
</body>
</html>
"""

def send_receptionist_booking_email(booking_info: dict) -> bool:
    """Dispatches a notification email to the clinic receptionist when an appointment is booked."""
    patient_name = booking_info.get("patient_name", "Unknown Patient")
    phone = booking_info.get("phone", "Unknown")
    appointment_day = booking_info.get("appointment_day", "Scheduled Day")
    appointment_date = booking_info.get("appointment_date", "")
    appointment_time = booking_info.get("appointment_time", "")
    area_of_concern = booking_info.get("area_of_concern", "Not specified")
    insurance_company = booking_info.get("insurance_company", "None")

    subject = f"🔔 New Appointment Request - {patient_name}"
    recipient = os.getenv("RECEPTIONIST_EMAIL", "receptionist@happyharmony.ca").strip()

    html_content = (
        RECEPTIONIST_EMAIL_TEMPLATE
        .replace("{{PATIENT_NAME}}", patient_name)
        .replace("{{PATIENT_PHONE}}", phone)
        .replace("{{APPOINTMENT_DAY}}", appointment_day)
        .replace("{{APPOINTMENT_DATE}}", appointment_date)
        .replace("{{APPOINTMENT_TIME}}", appointment_time)
        .replace("{{AREA_OF_CONCERN}}", area_of_concern)
        .replace("{{INSURANCE_COMPANY}}", insurance_company)
    )

    # 1. Try Resend API if RESEND_API_KEY is configured
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if resend_key:
        try:
            sender = os.getenv("RESEND_FROM", "Happy Harmony Clinic <notifications@happyharmony.ca>")
            with httpx.Client(timeout=6.0) as client:
                res = client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {resend_key}"},
                    json={
                        "from": sender,
                        "to": [recipient],
                        "subject": subject,
                        "html": html_content,
                    }
                )
                if res.status_code in (200, 201):
                    logger.info("Receptionist alert sent via Resend API to %s", recipient)
                    return True
                logger.warning("Resend API returned %s: %s", res.status_code, res.text)
        except Exception as e:
            logger.error("Failed sending via Resend API: %s", e)

    # 2. Try SMTP if SMTP_HOST is configured
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    if smtp_host:
        try:
            smtp_port = int(os.getenv("SMTP_PORT", "587"))
            smtp_user = os.getenv("SMTP_USER", "").strip()
            smtp_pass = os.getenv("SMTP_PASS", "").strip()
            from_addr = os.getenv("SMTP_FROM", smtp_user or "reception@happyharmony.ca")

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = from_addr
            msg["To"] = recipient
            msg.attach(MIMEText(html_content, "html"))

            with smtplib.SMTP(smtp_host, smtp_port, timeout=8.0) as server:
                server.starttls()
                if smtp_user and smtp_pass:
                    server.login(smtp_user, smtp_pass)
                server.sendmail(from_addr, [recipient], msg.as_string())
                logger.info("Receptionist alert sent via SMTP to %s", recipient)
                return True
        except Exception as e:
            logger.error("Failed sending via SMTP: %s", e)

    # 3. Log notification if no email service configured yet
    logger.info(
        "Receptionist Alert Notification: Patient=%s, Phone=%s, Slot=%s %s, Concern=%s, Insurance=%s -> Logged for reception review.",
        patient_name, phone, appointment_date, appointment_time, area_of_concern, insurance_company
    )
    return True
