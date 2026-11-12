import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime
from database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())[:8]


class MedicationModel(Base):
    __tablename__ = "medications"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    name = Column(String, nullable=False, index=True)
    dose = Column(String, default="")
    time = Column(String, default="08:00")  # HH:mm
    frequency = Column(String, default="Daily")
    duration_days = Column(Integer, default=30)
    start_date = Column(String, default=lambda: datetime.utcnow().isoformat())
    remaining_doses = Column(Integer, default=30)
    refill_threshold = Column(Integer, default=5)
    notes = Column(Text, default="")
    ai_insight = Column(Text, default="")
    expiry_date = Column(String, default="")  # YYYY-MM-DD
    is_deleted = Column(Boolean, default=False)  # Supports soft-delete & restore


class DoseLogModel(Base):
    __tablename__ = "dose_logs"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    medication_id = Column(String, nullable=False, index=True)
    timestamp = Column(String, default=lambda: datetime.utcnow().isoformat())
    status = Column(String, default="taken")  # 'taken', 'skipped', 'missed'


class DoctorVisitModel(Base):
    __tablename__ = "doctor_visits"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    doctor_name = Column(String, nullable=False)
    specialty = Column(String, default="")
    date = Column(String, nullable=False)  # YYYY-MM-DD
    time = Column(String, default="09:00")  # HH:mm
    location = Column(String, default="")
    notes = Column(Text, default="")
    remind_me = Column(Boolean, default=True)


class PrescriptionModel(Base):
    __tablename__ = "prescriptions"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    title = Column(String, nullable=False)
    doctor_name = Column(String, default="")
    date = Column(String, default=lambda: datetime.utcnow().strftime("%Y-%m-%d"))
    image = Column(Text, nullable=False)  # Base64 image payload
    doctor_note = Column(Text, default="")


class UserProfileModel(Base):
    __tablename__ = "user_profile"

    id = Column(Integer, primary_key=True, default=1)
    name = Column(String, default="")
    photo = Column(Text, default="")
    age = Column(String, default="")
    gender = Column(String, default="")
    blood_pressure = Column(String, default="")
    sugar_level = Column(String, default="")
    allergies = Column(Text, default="")
    doctor_notes = Column(Text, default="")
    additional_notes = Column(Text, default="")
    emergency_contacts = Column(String, default="")


class UserSettingsModel(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, default=1)
    sound_enabled = Column(Boolean, default=True)
    notifications_enabled = Column(Boolean, default=True)
    vibrate_enabled = Column(Boolean, default=True)
    alarm_style = Column(String, default="urgent")  # 'urgent' | 'gentle'
    snooze_duration = Column(Integer, default=5)
    missed_window = Column(Integer, default=60)

