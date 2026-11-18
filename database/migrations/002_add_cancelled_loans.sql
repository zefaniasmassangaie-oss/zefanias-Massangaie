PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE emprestimos_nova (
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

INSERT INTO emprestimos_nova (
  id, livro_id, leitor_id, usuario_id, data_emprestimo,
  data_prevista_devolucao, data_devolucao, cancelado_em, estado
)
SELECT
  id, livro_id, leitor_id, usuario_id, data_emprestimo,
  data_prevista_devolucao, data_devolucao, NULL, estado
FROM emprestimos;

DROP TABLE emprestimos;
ALTER TABLE emprestimos_nova RENAME TO emprestimos;

CREATE INDEX idx_emprestimos_livro_estado
  ON emprestimos (livro_id, estado);
CREATE INDEX idx_emprestimos_leitor
  ON emprestimos (leitor_id);
CREATE INDEX idx_emprestimos_usuario
  ON emprestimos (usuario_id);

COMMIT;
PRAGMA foreign_keys = ON;