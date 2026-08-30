from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Priority = Literal["essencial", "nao_essencial"]
ServiceType = Literal["peca", "peca_mao_de_obra", "peca_mao_de_obra_propria"]
BolsaOperation = Literal["compra", "venda", "compra_dolar", "venda_dolar"]
BolsaCurrency = Literal["BRL", "USD"]
DevedorStatus = Literal["pago", "nao_pago"]
EntityType = Literal["gasto", "receita", "servico_veiculo"]


# --- Auth ---

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    role: str

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str
    password: str = Field(min_length=6)


class UserUpdate(BaseModel):
    username: str
    password: Optional[str] = Field(default=None, min_length=6)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


# --- Dropdown options ---

class DropdownOptionCreate(BaseModel):
    priority: Priority
    name: str


class DropdownOptionUpdate(BaseModel):
    name: str


class DropdownOptionOut(BaseModel):
    id: int
    priority: Priority
    name: str
    active: bool

    class Config:
        from_attributes = True


# --- Gastos ---

class GastoCreate(BaseModel):
    priority: Priority
    item_id: int
    value: float = Field(gt=0)
    description: Optional[str] = None
    is_installment: bool = False
    installment_count: Optional[int] = Field(default=None, ge=2, le=120)


class GastoUpdate(BaseModel):
    priority: Priority
    item_id: int
    value: float = Field(gt=0)
    description: Optional[str] = None


class GastoAntecipar(BaseModel):
    value: Optional[float] = Field(default=None, gt=0)


class GastoOut(BaseModel):
    id: int
    priority: Priority
    item_id: int
    item_name: str
    value: float
    description: Optional[str]
    is_installment: bool
    installment_count: Optional[int]
    installment_number: Optional[int]
    installment_group_id: Optional[str]
    date: date
    created_at: datetime

    class Config:
        from_attributes = True


class GastoPage(BaseModel):
    items: list[GastoOut]
    total: int


# --- Receitas ---

class ReceitaCreate(BaseModel):
    value: float = Field(gt=0)
    cash_percentage: float = Field(ge=0, le=100)
    description: Optional[str] = None


class ReceitaUpdate(BaseModel):
    value: float = Field(gt=0)
    cash_percentage: float = Field(ge=0, le=100)
    description: Optional[str] = None


class ReceitaOut(BaseModel):
    id: int
    value: float
    cash_percentage: float
    cash_value: float
    description: Optional[str]
    date: date
    created_at: datetime

    class Config:
        from_attributes = True


class ReceitaPage(BaseModel):
    items: list[ReceitaOut]
    total: int


# --- Veículos ---

class VehicleCreate(BaseModel):
    name: str
    year: int = Field(ge=1900, le=2100)


class VehicleUpdate(BaseModel):
    name: str
    year: int = Field(ge=1900, le=2100)


class VehicleOut(BaseModel):
    id: int
    name: str
    year: int
    active: bool

    class Config:
        from_attributes = True


class VehicleServiceCreate(BaseModel):
    vehicle_id: int
    description: str
    notes: Optional[str] = None
    value: float = Field(ge=0)
    service_type: Optional[ServiceType] = None
    mileage: Optional[int] = Field(default=None, ge=0)


class VehicleServiceUpdate(VehicleServiceCreate):
    pass


class VehicleServiceOut(BaseModel):
    id: int
    vehicle_id: int
    vehicle_name: str
    description: str
    notes: Optional[str]
    value: float
    service_type: Optional[ServiceType]
    mileage: Optional[int]
    date: date
    created_at: datetime

    class Config:
        from_attributes = True


class VehicleServicePage(BaseModel):
    items: list[VehicleServiceOut]
    total: int


class VehicleResumoItem(BaseModel):
    vehicle_id: int
    vehicle_name: str
    total_gasto: float
    quantidade_servicos: int
    ultimo_servico: Optional[date]


class VehiclesResumo(BaseModel):
    veiculos: list[VehicleResumoItem]
    meses: list[str]
    series: list[dict]


# --- Resumo ---

class ItemPercentual(BaseModel):
    item_id: int
    item_name: str
    priority: Priority
    total: float
    percentual: float


class ResumoBase(BaseModel):
    total_gastos: float
    total_receita: float
    total_essenciais: float
    total_nao_essenciais: float
    quantidade_gastos: int
    quantidade_receitas: int
    total_caixa_pretendido: float
    total_caixa_real: float
    percentuais_itens: list[ItemPercentual]


class ResumoAnual(ResumoBase):
    ano: int
    media_gastos_mensal: float
    media_receitas_mensal: float
    evolucao_12_meses: list[dict]
    caixa_pretendido_vs_real: list[dict]


class ResumoMensal(ResumoBase):
    ano: int
    mes: int
    media_gastos_lancamento: float
    media_receitas_lancamento: float
    disponivel_para_gastar: float


class ResumoGeralAno(BaseModel):
    ano: int
    total_essenciais: float
    total_nao_essenciais: float
    total_receita: float
    total_caixa_pretendido: float
    total_caixa_real: float


class ResumoGeralMes(BaseModel):
    mes: int
    total_essenciais: float
    total_nao_essenciais: float
    total_receita: float
    total_caixa_pretendido: float
    total_caixa_real: float


class ResumoGeral(BaseModel):
    anos: list[ResumoGeralAno]
    por_mes: list[ResumoGeralMes]
    total_essenciais: float
    total_nao_essenciais: float
    total_receita: float
    total_caixa_pretendido: float
    total_caixa_real: float


# --- Anexos ---

class AttachmentOut(BaseModel):
    id: int
    entity_type: EntityType
    entity_id: str
    original_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime

    class Config:
        from_attributes = True


class AttachmentExistsOut(BaseModel):
    entity_ids_with_attachments: list[str]


# --- Backup ---

class BackupStatusOut(BaseModel):
    last_backup_at: Optional[datetime] = None
