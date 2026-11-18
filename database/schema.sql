PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS utilizadores (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL CHECK (trim(nome) <> ''),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (trim(email) <> ''),
  senha_hash TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('ADMIN', 'BIBLIOTECARIO', 'LEITOR')),
  estado TEXT NOT NULL DEFAULT 'ATIVO' CHECK (estado IN ('ATIVO', 'INATIVO')),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS livros (
  id INTEGER PRIMARY KEY,
  titulo TEXT NOT NULL CHECK (trim(titulo) <> ''),
  autor TEXT NOT NULL CHECK (trim(autor) <> ''),
  categoria TEXT,
  ano INTEGER CHECK (ano IS NULL OR ano BETWEEN 0 AND 9999),
  quantidade INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leitores (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL CHECK (trim(nome) <> ''),
  telefone TEXT,
  email TEXT COLLATE NOCASE UNIQUE,
  endereco TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emprestimos (
  id INTEGER PRIMARY KEY,
  livro_id INTEGER NOT NULL REFERENCES livros (id) ON DELETE RESTRICT,
  leitor_id INTEGER NOT NULL REFERENCES leitores (id) ON DELETE RESTRICT,
  usuario_id INTEGER NOT NULL REFERENCES utilizadores (id) ON DELETE RESTRICT,
  data_emprestimo TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_prevista_devolucao TEXT NOT NULL,
  data_devolucao TEXT,
  cancelado_em TEXT,
  estado TEXT NOT NULL DEFAULT 'EMPRESTADO'
    CHECK (estado IN ('EMPRESTADO', 'DEVOLVIDO', 'CANCELADO')),
  CHECK (data_devolucao IS NULL OR data_devolucao >= data_emprestimo),
  CHECK (
    (estado = 'EMPRESTADO' AND data_devolucao IS NULL AND cancelado_em IS NULL)
    OR (estado = 'DEVOLVIDO' AND data_devolucao IS NOT NULL AND cancelado_em IS NULL)
    OR (estado = 'CANCELADO' AND data_devolucao IS NULL AND cancelado_em IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_emprestimos_livro_estado
  ON emprestimos (livro_id, estado);
CREATE INDEX IF NOT EXISTS idx_emprestimos_leitor
  ON emprestimos (leitor_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_usuario
  ON emprestimos (usuario_id);

CREATE TABLE IF NOT EXISTS relatorios_diarios (
  id INTEGER PRIMARY KEY,
  data_referencia TEXT NOT NULL UNIQUE
    CHECK (date(data_referencia) = data_referencia),
  total_saidas INTEGER NOT NULL CHECK (total_saidas >= 0),
  total_devolucoes INTEGER NOT NULL CHECK (total_devolucoes >= 0),
  total_atrasados INTEGER NOT NULL CHECK (total_atrasados >= 0),
  utilizador_id INTEGER NOT NULL REFERENCES utilizadores (id) ON DELETE RESTRICT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);