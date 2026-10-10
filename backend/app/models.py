from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
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


class Notificacao(Base):
    """Avisos da central de notificações do app: o resumo da virada do mês (tipo "resumo_mensal",
    gerado sob demanda por app/resumo_mensal.py; payload é o conteúdo já calculado, em JSON -- uma
    foto do momento da geração) e o aviso de relatório anual pronto (tipo "relatorio_anual",
    app/relatorio_anual.py; payload "{}", mes = 12)."""

    __tablename__ = "notificacoes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tipo = Column(String, nullable=False)  # "resumo_mensal" | "relatorio_anual"
    ano = Column(Integer, nullable=False)  # mês de referência do aviso
    mes = Column(Integer, nullable=False)
    titulo = Column(String, nullable=False)
    payload = Column(String, nullable=False)  # JSON
    lida_em = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Um aviso por tipo e mês -- duas requisições simultâneas gerando o mesmo resumo não duplicam.
    __table_args__ = (UniqueConstraint("user_id", "tipo", "ano", "mes", name="uq_notificacoes_user_tipo_mes"),)


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
