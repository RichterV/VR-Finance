"""Módulos opcionais do app, habilitados por usuário (tabela user_modules).

Início (resumos + Gastos/Receitas/Categorias) não entra aqui: é sempre habilitado pra todo
usuário. O master sempre tem todos os módulos, sem precisar de linha na tabela. Um módulo novo
só precisa entrar nesta tupla (e no registro espelhado do frontend, core/modules.ts).
"""

OPTIONAL_MODULES: tuple[str, ...] = (
    "veiculos",
    "ferramentas",
    "exportar_dados",
)
