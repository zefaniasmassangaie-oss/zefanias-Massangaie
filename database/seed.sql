INSERT INTO livros (titulo, autor, categoria, ano, quantidade)
SELECT 'O Pequeno Príncipe', 'Antoine de Saint-Exupéry', 'Infantil', 1943, 3
WHERE NOT EXISTS (
  SELECT 1 FROM livros
  WHERE titulo = 'O Pequeno Príncipe' AND autor = 'Antoine de Saint-Exupéry'
);

INSERT INTO livros (titulo, autor, categoria, ano, quantidade)
SELECT 'Dom Casmurro', 'Machado de Assis', 'Romance', 1899, 4
WHERE NOT EXISTS (
  SELECT 1 FROM livros
  WHERE titulo = 'Dom Casmurro' AND autor = 'Machado de Assis'
);

INSERT INTO livros (titulo, autor, categoria, ano, quantidade)
SELECT 'Memórias Póstumas de Brás Cubas', 'Machado de Assis', 'Romance', 1881, 3
WHERE NOT EXISTS (
  SELECT 1 FROM livros
  WHERE titulo = 'Memórias Póstumas de Brás Cubas' AND autor = 'Machado de Assis'
);

INSERT INTO livros (titulo, autor, categoria, ano, quantidade)
SELECT 'O Cortiço', 'Aluísio Azevedo', 'Romance', 1890, 2
WHERE NOT EXISTS (
  SELECT 1 FROM livros
  WHERE titulo = 'O Cortiço' AND autor = 'Aluísio Azevedo'
);

INSERT INTO livros (titulo, autor, categoria, ano, quantidade)
SELECT 'Iracema', 'José de Alencar', 'Romance', 1865, 3
WHERE NOT EXISTS (
  SELECT 1 FROM livros
  WHERE titulo = 'Iracema' AND autor = 'José de Alencar'
);

INSERT INTO livros (titulo, autor, categoria, ano, quantidade)
SELECT 'A Moreninha', 'Joaquim Manuel de Macedo', 'Romance', 1844, 2
WHERE NOT EXISTS (
  SELECT 1 FROM livros
  WHERE titulo = 'A Moreninha' AND autor = 'Joaquim Manuel de Macedo'
);