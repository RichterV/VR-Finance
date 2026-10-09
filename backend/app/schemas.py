from datetime import date, datetime, timezone
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints, field_serializer

Priority = Literal["essencial", "nao_essencial"]
ServiceType = Literal["peca", "peca_mao_de_obra", "peca_mao_de_obra_propria"]
BolsaOperation = Literal["compra", "venda", "compra_dolar", "venda_dolar"]
BolsaCurrency = Literal["BRL", "USD"]
DevedorStatus = Literal["pago", "nao_pago"]
EntityType = Literal["gasto", "receita", "servico_veiculo"]
# Espelha app.modules.OPTIONAL_MODULES
# Alias pra campos chamados `date` com default: `date: Optional[date] = None` faria o Pydantic
# resolver o tipo como o próprio default (None) em vez de `datetime.date`.
DateField = date



def _round_money(value):
    # Antes do Field(gt=0): 0,004 vira 0,00 e é rejeitado, em vez de passar e ser gravado como zero.
    if value is None or isinstance(value, bool):
        return value
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return value  # o Pydantic devolve o erro de tipo normal


# Valor em R$ sempre com 2 casas (o banco guarda REAL -- sem isso ficavam valores como 411.10848).
Money = Annotated[float, BeforeValidator(_round_money)]
# Texto obrigatório: espaços nas pontas removidos e vazio rejeitado (422).
NonBlank = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

ModuleKey = Literal["veiculos", "operacoes_bolsa", "devedores", "ferramentas", "exportar_dados", "analise_inflacionaria"]


# --- Auth ---

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    first_name: str
    last_name: str
    modules: list[str]
    must_change_password: bool
    default_cash_percentage: float
    last_login_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    @field_serializer("last_login_at", "last_activity_at")
    def _serialize_utc_datetime(self, value: Optional[datetime]) -> Optional[str]:
        # Gravado em UTC sem tzinfo; sem o offset explícito o navegador leria como horário local.
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc).isoformat()


class UserCreate(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=6)
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    modules: list[ModuleKey] = []


class UserUpdate(BaseModel):
    username: str = Field(min_length=1)
    password: Optional[str] = Field(default=None, min_length=6)
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    # None = não mexe nos módulos atuais
    modules: Optional[list[ModuleKey]] = None


class ProfileUpdate(BaseModel):
    """Usuário logado editando a própria conta (PUT /auth/me)."""

    username: str = Field(min_length=1)
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)


class ProfileUpdateOut(BaseModel):
    # O JWT carrega o username no "sub" -- trocar o username invalida o token antigo, então a
    # resposta já devolve um novo pro frontend substituir o guardado.
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CashPercentageDefault(BaseModel):
    """% de caixa pré-selecionado em "Adicionar receita" (PUT /auth/me/default-cash-percentage)."""

    default_cash_percentage: float = Field(ge=0, le=100)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class PasswordChangeOut(BaseModel):
    detail: str
    # Token novo: a troca revoga todos os tokens anteriores, inclusive o deste aparelho.
    access_token: str


# --- Dropdown options ---

class DropdownOptionCreate(BaseModel):
    priority: Priority
    name: NonBlank


class DropdownOptionUpdate(BaseModel):
    name: NonBlank
    include_in_inflation: Optional[bool] = None


class DropdownOptionOut(BaseModel):
    id: int
    priority: Priority
    name: str
    active: bool
    include_in_inflation: bool

    class Config:
        from_attributes = True


# --- Gastos ---

class GastoCreate(BaseModel):
    priority: Priority
    item_id: int
    value: Money = Field(gt=0)
    description: Optional[str] = None
    is_installment: bool = False
    installment_count: Optional[int] = Field(default=None, ge=2, le=120)
    # Omitido = hoje. Parcelado: data da parcela 1.
    date: Optional[DateField] = None
    # Recorrente: este lançamento é o 1º; a regra gera os próximos a partir do mês seguinte.
    recorrente: bool = False
    recorrencia_dia: Optional[int] = Field(default=None, ge=1, le=31)
    # Último mês que gera (qualquer dia dele serve); omitido = repete sem fim.
    recorrencia_fim: Optional[DateField] = None


class GastoUpdate(BaseModel):
    priority: Priority
    item_id: int
    value: Money = Field(gt=0)
    description: Optional[str] = None


class GastoAntecipar(BaseModel):
    value: Optional[Money] = Field(default=None, gt=0)


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
    recorrencia_id: Optional[int] = None
    date: date
    created_at: datetime

    class Config:
        from_attributes = True


class GastoPage(BaseModel):
    items: list[GastoOut]
    total: int


# --- Receitas ---

class ReceitaCreate(BaseModel):
    value: Money = Field(gt=0)
    cash_percentage: float = Field(ge=0, le=100)
    description: Optional[str] = None
    # Omitido = hoje.
    date: Optional[DateField] = None
    recorrente: bool = False
    recorrencia_dia: Optional[int] = Field(default=None, ge=1, le=31)
    # Último mês que gera (qualquer dia dele serve); omitido = repete sem fim.
    recorrencia_fim: Optional[DateField] = None


class ReceitaUpdate(BaseModel):
    value: Money = Field(gt=0)
    cash_percentage: float = Field(ge=0, le=100)
    description: Optional[str] = None


class ReceitaOut(BaseModel):
    id: int
    value: float
    cash_percentage: float
    cash_value: float
    description: Optional[str]
    recorrencia_id: Optional[int] = None
    date: date
    created_at: datetime

    class Config:
        from_attributes = True


class ReceitaPage(BaseModel):
    items: list[ReceitaOut]
    total: int


# --- Recorrências ---

RecorrenciaTipo = Literal["gasto", "receita"]
RecorrenciaStatus = Literal["ativa", "pausada", "encerrada"]


class RecorrenciaUpdate(BaseModel):
    """Vale dos próximos lançamentos em diante; os já gerados não mudam. Campos de gasto (priority,
    item_id) são ignorados numa receita, e cash_percentage num gasto."""

    priority: Optional[Priority] = None
    item_id: Optional[int] = None
    value: Money = Field(gt=0)
    cash_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    description: Optional[str] = None
    dia: int = Field(ge=1, le=31)
    # Último mês que gera (inclusive) -- qualquer dia do mês serve; null = sem fim.
    fim_mes: Optional[DateField] = None


class RecorrenciaOut(BaseModel):
    id: int
    tipo: RecorrenciaTipo
    priority: Optional[Priority]
    item_id: Optional[int]
    item_name: Optional[str]
    item_active: Optional[bool]
    value: float
    cash_percentage: Optional[float]
    description: Optional[str]
    dia: int
    pausada: bool
    fim_mes: Optional[date]
    status: RecorrenciaStatus
    # Data do próximo lançamento que será gerado (null se pausada/encerrada).
    proxima_data: Optional[date]
    # Lançamento deste mês já gerado e ainda com data futura -- oferecido pra apagar junto ao excluir.
    lancamento_pendente_data: Optional[date] = None
    created_at: datetime


# --- Veículos ---

class VehicleCreate(BaseModel):
    name: NonBlank
    year: int = Field(ge=1900, le=2100)


class VehicleUpdate(BaseModel):
    name: NonBlank
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
    description: NonBlank
    notes: Optional[str] = None
    value: Money = Field(ge=0)
    service_type: Optional[ServiceType] = None
    mileage: int = Field(ge=0)


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


class InflacaoPonto(BaseModel):
    ano: int
    mes: int
    total_cesta: float
    variacao_pct: Optional[float]  # None = sem base de comparação (ex: mês anterior sem gasto)
    caixa_real_pct: float


class ResumoInflacao(BaseModel):
    possui_cesta: bool
    cesta: list[str]  # nomes das categorias marcadas, só pra exibir
    mensal: list[InflacaoPonto]  # variacao_pct = mês a mês
    anual: list[InflacaoPonto]  # variacao_pct = ano a ano
    headline_mom_pct: Optional[float]
    headline_yoy_pct: Optional[float]


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


# --- Notificações / resumo da virada do mês ---

class IndicadorMensal(BaseModel):
    valor: float
    media: Optional[float]  # média dos meses base com dados; None = sem histórico pra comparar
    variacao_pct: Optional[float]


class DetalheCategoria(BaseModel):
    item_id: int
    item_name: str
    priority: Priority
    total: float
    pct: float  # do total de gastos do mês
    lancamentos: int
    media: Optional[float]  # média dos meses base com dados (zero onde a categoria não apareceu)
    variacao_pct: Optional[float]


class ComposicaoGastos(BaseModel):
    recorrentes: float  # avulsos ligados a uma recorrência
    parcelas: float
    avulsos_essenciais: float
    avulsos_nao_essenciais: float


class DetalhesMesOut(BaseModel):
    """Modal "Ver detalhes" do mês: totais com comparação, categorias, composição e o que ainda vai cair."""

    ano: int
    mes: int
    situacao: Literal["passado", "atual", "futuro"]
    dia_atual: Optional[int]  # só no mês atual
    dias_no_mes: int
    meses_base: int
    receita: IndicadorMensal
    gastos: IndicadorMensal
    caixa_pretendido: IndicadorMensal
    caixa_real: IndicadorMensal
    disponivel: IndicadorMensal  # receita − gastos − caixa pretendido
    quantidade_gastos: int
    quantidade_receitas: int
    categorias: list[DetalheCategoria]
    composicao: ComposicaoGastos
    ja_lancado: float  # gastos com data até hoje (mês inteiro, se passado)
    programado: float  # gastos com data depois de hoje (mês inteiro, se futuro)


class TaxaPoupanca(BaseModel):
    valor_pct: Optional[float]  # caixa real ÷ receita do mês; None = mês sem receita
    media_pct: Optional[float]
    meta_pct: Optional[float]  # caixa pretendido ÷ receita (o que o usuário pretendia guardar)


class VariacaoCategoria(BaseModel):
    item_id: int
    item_name: str
    priority: Priority
    valor: float
    media: float
    diferenca: float
    variacao_pct: float


class GastoPontual(BaseModel):
    item_id: int
    item_name: str
    priority: Priority
    valor: float


class ParcelamentoResumo(BaseModel):
    descricao: str
    item_name: str
    valor_parcela: float
    parcelas: int


class InflacaoResumo(BaseModel):
    cesta: list[str]
    total_cesta: float
    variacao_pct: Optional[float]


class DevedoresResumo(BaseModel):
    parcelas_atrasadas: int
    valor_atrasado: float


class ResumoMensalPayload(BaseModel):
    ano: int
    mes: int
    meses_base: int  # quantos meses anteriores formam a média de comparação
    gastos: IndicadorMensal
    receita: IndicadorMensal
    caixa_real: IndicadorMensal
    caixa_pretendido: IndicadorMensal
    taxa_poupanca: TaxaPoupanca
    subiram: list[VariacaoCategoria]
    cairam: list[VariacaoCategoria]
    pontuais: list[GastoPontual]
    parcelamentos_novos: list[ParcelamentoResumo]
    parcelamentos_encerrados: list[ParcelamentoResumo]
    inflacao: Optional[InflacaoResumo] = None  # None = módulo desabilitado ou cesta vazia
    devedores: Optional[DevedoresResumo] = None  # None = módulo desabilitado


class NotificacaoOut(BaseModel):
    id: int
    tipo: Literal["resumo_mensal"]
    ano: int
    mes: int
    titulo: str
    lida: bool
    created_at: datetime
    payload: ResumoMensalPayload

    @field_serializer("created_at")
    def _serialize_utc_datetime(self, value: datetime) -> str:
        return value.replace(tzinfo=timezone.utc).isoformat()


# --- Analytics (anomalia, previsão do fim do mês, indicadores) ---

class AnomaliaOut(BaseModel):
    anomalo: bool
    mediana: Optional[float]  # mediana dos lançamentos avulsos da categoria nos últimos 12 meses
    multiplo: Optional[float]  # valor ÷ mediana
    amostras: int


class PrevisaoOut(BaseModel):
    ano: int
    mes: int
    dia: int
    historico_suficiente: bool  # menos de 3 meses com gasto avulso = previsão pouco confiável
    receita: float
    receita_estimada: bool  # sem receita lançada no mês: mediana dos últimos 6 meses
    comprometido: float  # todo gasto do mês já lançado (inclusive parcelas e datas futuras)
    variavel_ate_hoje: float
    variavel_restante: float  # quanto ainda deve sair de gasto variável até o fim do mês
    caixa_pretendido: float
    saldo_previsto: float
    saldo_min: float
    saldo_max: float


class PontoIndicador(BaseModel):
    ano: int
    mes: int
    valor: Optional[float]


class IndicadorPoupanca(BaseModel):
    atual_3m_pct: Optional[float]
    serie: list[PontoIndicador]


class IndicadorComprometimento(BaseModel):
    pct: Optional[float]  # parcelas dos próximos 6 meses ÷ (receita média × 6)
    total: float
    receita_media: float
    meses: list[PontoIndicador]


class CustoFixoItem(BaseModel):
    descricao: str
    item_name: str
    valor: float


class IndicadorCustoFixo(BaseModel):
    pct: Optional[float]
    total: float
    itens: list[CustoFixoItem]


class IndicadorEssencial(BaseModel):
    atual_pct: Optional[float]
    inclinacao_pp_mes: Optional[float]
    serie: list[PontoIndicador]


class IndicadoresOut(BaseModel):
    ano: int
    mes: int
    poupanca: IndicadorPoupanca
    comprometimento: IndicadorComprometimento
    custo_fixo: IndicadorCustoFixo
    essencial: IndicadorEssencial
