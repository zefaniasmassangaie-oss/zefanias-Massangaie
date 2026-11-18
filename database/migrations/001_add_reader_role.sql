PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE utilizadores_new (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL CHECK (trim(nome) <> ''),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (trim(email) <> ''),
  senha_hash TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('ADMIN', 'BIBLIOTECARIO', 'LEITOR')),
  estado TEXT NOT NULL DEFAULT 'ATIVO' CHECK (estado IN ('ATIVO', 'INATIVO')),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO utilizadores_new (id, nome, email, senha_hash, nivel, estado, criado_em)
SELECT id, nome, email, senha_hash, nivel, estado, criado_em
FROM utilizadores;

DROP TABLE utilizadores;
ALTER TABLE utilizadores_new RENAME TO utilizadores;

COMMIT;
PRAGMA foreign_keys = ON;