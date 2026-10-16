from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import relationship

from app.database import Base
from app.modules import OPTIONAL_MODULES


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")  # "master" | "user"
    first_name = Column(String, nullable=False, default="")
    last_name = Column(String, nullable=False, default="")
    # Senha definida pelo master (criação ou reset) -- o usuário precisa trocar antes de usar o app
    must_change_password = Column(Boolean, nullable=False, default=False)
    # % de caixa que já vem selecionado em "Adicionar receita" (botão "Usar como padrão")
    default_cash_percentage = Column(Float, nullable=False, default=50)
    # Tema visual escolhido no Perfil (uma das chaves de schemas.ThemeKey) -- cada usuário tem o seu
    theme = Column(String, nullable=False, default="salvia")
    # Último POST /auth/login bem-sucedido (UTC, sem tzinfo -- mesmo padrão de created_at). Null =
    # nunca logou desde que a coluna existe. "Mudar pra conta teste" não conta como login.
    last_login_at = Column(DateTime, nullable=True)
    # Última requisição autenticada (UTC, regravada no máximo 1x por minuto -- deps.ACTIVITY_WRITE_INTERVAL)
    # ou último login. Uso via "Mudar pra conta teste" não conta. Exibido no painel de admin.
    last_activity_at = Column(DateTime, nullable=True)
    # Incrementado a cada troca/reset de senha -- invalida todo token emitido antes (claim "tv").
    token_version = Column(Integer, nullable=False, default=0)
    # Foto de perfil (app/avatars.py): nome do arquivo em <upload_dir>/avatars/ (uuid4 + .jpg, nunca o
    # nome enviado) e quando foi trocada (UTC) -- vira a "versão" que o front usa pra não mostrar a antiga.
    avatar_filename = Column(String, nullable=True)
    avatar_updated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    module_rows = relationship("UserModule", cascade="all, delete-orphan")

    @property
    def avatar_version(self) -> int | None:
        """Muda a cada foto nova (segundos desde 1970); None = sem foto."""
        if not self.avatar_filename or not self.avatar_updated_at:
            return None
        return int(self.avatar_updated_at.replace(tzinfo=timezone.utc).timestamp())

    @property
    def modules(self) -> list[str]:
        """Módulos opcionais habilitados (ver app/modules.py) -- o master sempre tem todos."""
        if self.role == "master":
            return list(OPTIONAL_MODULES)
        enabled = {row.module_key for row in self.module_rows}
        return [key for key in OPTIONAL_MODULES if key in enabled]

    def set_modules(self, keys: list[str]) -> None:
        wanted = set(keys)
        self.module_rows = [row for row in self.module_rows if row.module_key in wanted]
        current = {row.module_key for row in self.module_rows}
        for key in OPTIONAL_MODULES:
            if key in wanted and key not in current:
                self.module_rows.append(UserModule(module_key=key))


class UserModule(Base):
    __tablename__ = "user_modules"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    module_key = Column(String, nullable=False)  # uma das chaves de app.modules.OPTIONAL_MODULES

    __table_args__ = (UniqueConstraint("user_id", "module_key", name="uq_user_modules_user_module"),)


class DropdownOption(Base):
    __tablename__ = "dropdown_options"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    priority = Column(String, nullable=False)  # "essencial" | "nao_essencial"
    name = Column(String, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    include_in_inflation = Column(Boolean, default=False, nullable=False)
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
    # Lançamento gerado por (ou que deu origem a) uma recorrência -- null nos avulsos.
    recorrencia_id = Column(Integer, ForeignKey("recorrencias.id"), nullable=True, index=True)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_gastos_user_date", "user_id", "date"),)

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
    recorrencia_id = Column(Integer, ForeignKey("recorrencias.id"), nullable=True, index=True)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_receitas_user_date", "user_id", "date"),)


class Recorrencia(Base):
    """Gasto ou receita que se repete todo mês. Cada mês vira um lançamento comum em gastos/receitas
    (gerado na virada do mês por app/recorrencias.py); editar a regra só vale dos próximos em diante."""

    __tablename__ = "recorrencias"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tipo = Column(String, nullable=False)  # "gasto" | "receita"
    priority = Column(String, nullable=True)  # só gasto
    item_id = Column(Integer, ForeignKey("dropdown_options.id"), nullable=True)  # só gasto
    value = Column(Float, nullable=False)
    cash_percentage = Column(Float, nullable=True)  # só receita
    description = Column(String, nullable=True)
    dia = Column(Integer, nullable=False)  # 1..31; mês sem esse dia usa o último dia do mês
    proximo_mes = Column(Date, nullable=False)  # dia 1 do próximo mês a gerar
    fim_mes = Column(Date, nullable=True)  # dia 1 do último mês que gera (inclusive); null = sem fim
    pausada = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    item = relationship("DropdownOption")

    @property
    def item_name(self) -> Optional[str]:
        return self.item.name if self.item else None

    @property
    def item_active(self) -> Optional[bool]:
        return self.item.active if self.item else None


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Empresa(Base):
    """Empresa do usuário (módulo Empresa) -- hoje uma só por usuário, MEI."""

    __tablename__ = "empresas"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    nome = Column(String, nullable=False)
    cnpj = Column(String, nullable=False)  # só dígitos
    data_abertura = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class NotaFiscal(Base):
    """Nota fiscal de serviço emitida pela empresa do usuário."""

    __tablename__ = "notas_fiscais"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    numero = Column(String, nullable=False)
    chave_acesso = Column(String, nullable=True)  # NFS-e nacional: 50 dígitos
    data_emissao = Column(Date, nullable=False)
    competencia = Column(Date, nullable=False)  # dia 1 do mês de competência -- é o que conta no limite
    tomador_nome = Column(String, nullable=False)
    tomador_documento = Column(String, nullable=True)  # CPF/CNPJ, só dígitos
    valor = Column(Float, nullable=False)
    descricao = Column(String, nullable=True)
    # Nota substituta: chave de acesso da nota que ela substitui (vem do XML, `subst/chSubstda`)
    substitui_chave = Column(String, nullable=True)
    # Nota original já substituída: id da substituta. Fica no histórico, mas não conta no limite.
    substituida_por = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "numero", name="uq_notas_fiscais_user_numero"),
        Index("ix_notas_fiscais_user_competencia", "user_id", "competencia"),
    )



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

    __table_args__ = (Index("ix_vehicle_services_user_date", "user_id", "date"),)

    vehicle = relationship("Vehicle")

    @property
    def vehicle_name(self) -> str:
        return self.vehicle.name


class Imovel(Base):
    """Módulo Manutenção Casa: imóvel cujas manutenções são registradas (mesmo papel do veículo).
    Exclusão é soft delete (active=False), pra preservar o histórico de serviços."""

    __tablename__ = "imoveis"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ServicoCasa(Base):
    """Serviço de manutenção de um imóvel. Separado das finanças pessoais (não vira gasto)."""

    __tablename__ = "servicos_casa"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    imovel_id = Column(Integer, ForeignKey("imoveis.id"), nullable=False)
    description = Column(String, nullable=False)
    notes = Column(String, nullable=True)
    value = Column(Float, nullable=False)
    categoria = Column(String, nullable=False)  # ver schemas.CasaCategoria
    service_type = Column(String, nullable=True)  # ver schemas.CasaServiceType
    prestador = Column(String, nullable=True)
    garantia_ate = Column(Date, nullable=True)
    date = Column(Date, nullable=False)
    # Quem cadastrou (o dono ou um convidado do imóvel compartilhado -- user_id é sempre o do dono).
    # Null = a conta foi excluída depois.
    criado_por = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_servicos_casa_user_date", "user_id", "date"),)

    imovel = relationship("Imovel")
    criador = relationship("User", foreign_keys=[criado_por])

    @property
    def imovel_name(self) -> str:
        return self.imovel.name

    @property
    def criado_por_nome(self) -> Optional[str]:
        if self.criador is None:
            return None
        return f"{self.criador.first_name} {self.criador.last_name}".strip() or self.criador.username


class Compartilhamento(Base):
    """Item de um usuário (hoje só imóvel do Manutenção Casa) compartilhado com outro (app/compartilhamento.py).
    Só vale depois que o convidado aceita; o dado continua do dono (user_id dele), não é cópia."""

    __tablename__ = "compartilhamentos"

    id = Column(Integer, primary_key=True)
    item_tipo = Column(String, nullable=False)  # "imovel" (pronto pra "vehicle" depois)
    item_id = Column(Integer, nullable=False)
    dono_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    convidado_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    nivel = Column(String, nullable=False)  # "leitura" | "cadastro" | "edicao" | "total" (acumulados)
    # "pendente" | "aceito" | "recusado" | "cancelado" | "expirado" | "encerrado"
    status = Column(String, nullable=False, default="pendente")
    created_at = Column(DateTime, default=datetime.utcnow)  # envio -- base dos 30 dias pra expirar
    respondido_em = Column(DateTime, nullable=True)
    encerrado_em = Column(DateTime, nullable=True)

    dono = relationship("User", foreign_keys=[dono_id])
    convidado = relationship("User", foreign_keys=[convidado_id])

    # Um só pendente/aceito por item e convidado -- reenviar depois de recusa/expiração pode.
    __table_args__ = (
        Index(
            "uq_compartilhamentos_ativo",
            "item_tipo",
            "item_id",
            "convidado_id",
            unique=True,
            sqlite_where=text("status IN ('pendente', 'aceito')"),
        ),
    )


# Tipos de notificação com mês de referência (um por mês -- ver uq_notificacoes_periodo).
NOTIFICACAO_TIPOS_PERIODO = ("resumo_mensal", "relatorio_anual")


class Notificacao(Base):
    """Avisos da central de notificações do app: o resumo da virada do mês (tipo "resumo_mensal",
    gerado sob demanda por app/resumo_mensal.py; payload é o conteúdo já calculado, em JSON -- uma
    foto do momento da geração), o aviso de relatório anual pronto (tipo "relatorio_anual",
    app/relatorio_anual.py; payload "{}", mes = 12) e os avisos de compartilhamento
    ("compartilhamento_*", app/compartilhamento.py; sem mês, ref_id = id do compartilhamento)."""

    __tablename__ = "notificacoes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tipo = Column(String, nullable=False)
    ano = Column(Integer, nullable=True)  # mês de referência (só resumo mensal / relatório anual)
    mes = Column(Integer, nullable=True)
    ref_id = Column(Integer, nullable=True)  # compartilhamento.id nos avisos de compartilhamento
    titulo = Column(String, nullable=False)
    payload = Column(String, nullable=False)  # JSON
    lida_em = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Um aviso por tipo e mês -- duas requisições simultâneas gerando o mesmo resumo não duplicam.
    __table_args__ = (
        Index(
            "uq_notificacoes_periodo",
            "user_id",
            "tipo",
            "ano",
            "mes",
            unique=True,
            sqlite_where=text("tipo IN ('resumo_mensal', 'relatorio_anual')"),
        ),
    )


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    entity_type = Column(String, nullable=False)  # "gasto" | "receita" | "servico_veiculo" | "servico_casa" | "operacao_bolsa" | "devedor"
    entity_id = Column(String, nullable=False)  # str(id) do registro, OU installment_group_id (grupo parcelado)
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False, unique=True)  # uuid4().hex + extensao, nome real em disco
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_attachments_entity", "entity_type", "entity_id"),)


class LixeiraItem(Base):
    """Lixeira (app/lixeira.py): registro ou anexo excluído nos últimos 15 dias. Guarda uma foto da
    linha (payload JSON) -- o registro sai da tabela dele de verdade, então nenhum resumo, relatório
    ou exportação precisa saber da lixeira. O arquivo do anexo continua no mesmo lugar do disco até
    sair da lixeira de vez."""

    __tablename__ = "lixeira"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tipo = Column(String, nullable=False)  # "registro" | "anexo"
    entity_type = Column(String, nullable=False)  # mesmos valores de attachments.entity_type
    # Registro: id original. Anexo: a chave do anexo (id do registro ou installment_group_id).
    entity_id = Column(String, nullable=False)
    group_id = Column(String, nullable=True)  # installment_group_id do registro (gasto/devedor)
    # Anexo que saiu junto com um registro: id do item desse registro (volta junto ao restaurar).
    # Null = anexo excluído sozinho.
    parent_id = Column(Integer, nullable=True, index=True)
    titulo = Column(String, nullable=False)
    detalhe = Column(String, nullable=True)
    valor = Column(Float, nullable=True)
    data_registro = Column(Date, nullable=True)
    payload = Column(String, nullable=False)  # JSON com as colunas da linha original
    deleted_at = Column(DateTime, nullable=False)  # UTC, sem tzinfo

    __table_args__ = (Index("ix_lixeira_user_deleted", "user_id", "deleted_at"),)
