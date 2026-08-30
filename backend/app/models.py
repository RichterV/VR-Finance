from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")  # "master" | "user"
    created_at = Column(DateTime, default=datetime.utcnow)


class DropdownOption(Base):
    __tablename__ = "dropdown_options"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    priority = Column(String, nullable=False)  # "essencial" | "nao_essencial"
    name = Column(String, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Gasto(Base):
    __tablename__ = "gastos"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    priority = Column(String, nullable=False)  # "essencial" | "nao_essencial"
    item_id = Column(Integer, ForeignKey("dropdown_options.id"), nullable=False)
    value = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    is_installment = Column(Boolean, default=False, nullable=False)
    installment_count = Column(Integer, nullable=True)
    installment_number = Column(Integer, nullable=True)
    installment_group_id = Column(String, nullable=True, index=True)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    item = relationship("DropdownOption")

    @property
    def item_name(self) -> str:
        return self.item.name


class Receita(Base):
    __tablename__ = "receitas"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    value = Column(Float, nullable=False)
    cash_percentage = Column(Float, nullable=False)
    cash_value = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class VehicleService(Base):
    __tablename__ = "vehicle_services"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    description = Column(String, nullable=False)
    notes = Column(String, nullable=True)
    value = Column(Float, nullable=False)
    service_type = Column(String, nullable=True)
    mileage = Column(Integer, nullable=True)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship("Vehicle")

    @property
    def vehicle_name(self) -> str:
        return self.vehicle.name


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    entity_type = Column(String, nullable=False)  # "gasto" | "receita" | "servico_veiculo" | "operacao_bolsa" | "devedor"
    entity_id = Column(String, nullable=False)  # str(id) do registro, OU installment_group_id (grupo parcelado)
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False, unique=True)  # uuid4().hex + extensao, nome real em disco
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_attachments_entity", "entity_type", "entity_id"),)
