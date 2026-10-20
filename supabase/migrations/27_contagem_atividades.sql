-- =============================================================================
-- CNRO Lab Control — Migração 27: contagem de ensaios por atividade
-- =============================================================================
-- Pré-requisito: migração 26. Rodar no SQL Editor. Idempotente, transação única.
-- Não muda telas, lançamento nem dados: só cria uma tabela de regras e uma view de leitura.
--
-- Para quê: o quadro de totais da gerência (Visão Geral do GestLab) conta os ensaios
-- por ATIVIDADE, como a planilha "Análises de Ensaios" — cada corpo de prova, determinação,
-- ponto, furo ou cilindro ensaiado é uma unidade (decisões de 20/10/2026 — doc do projeto
-- CNRO_Lab_Contagem_por_Atividade.md).
--
--  • public.contagem_regras: para cada ficha, as atividades que ela gera e as "unidades"
--    (listas de células). Uma unidade conta quando qualquer célula dela foi digitada.
--    modo 'unidades' = nº de unidades preenchidas · 'uma' = 1 se houver algo preenchido.
--    Gerada por tools/fichas/contagem_regras.py (a partir dos modelos das fichas).
--  • public.contagem_atividades (view): uma linha por O.S. × atividade (× ficha), com a
--    quantidade. Vale a ficha usada no ensaio (não o nome do ensaio do pedido).
--    Moldagem (vem do pedido, não da ficha):
--      - CP's de concreto: pedido de concreto, CPs com "responsável pela moldagem" = CNRO;
--      - CP's solo cimento: pedido da subcategoria "CPs solo-cimento" (sempre).
--    Entram as O.S. numeradas e não canceladas; fichas em qualquer situação
--    (status_ensaio vem junto para quem quiser filtrar só as aprovadas).
--
-- Uso:  select atividade, sum(quantidade) from contagem_atividades
--        where aberto_em >= '2026-01-01' group by 1 order by 2 desc;
-- =============================================================================

begin;

create table if not exists public.contagem_regras (
  ficha_codigo text not null,
  atividade    text not null,
  modo         text not null check (modo in ('unidades', 'uma')),
  unidades     jsonb not null default '[]'::jsonb,
  ordem        integer not null default 0,
  primary key (ficha_codigo, atividade)
);

alter table public.contagem_regras enable row level security;
drop policy if exists contagem_regras_select on public.contagem_regras;
create policy contagem_regras_select on public.contagem_regras for select to authenticated using (true);

-- Uma unidade (lista de células) tem algo digitado?
create or replace function public._contagem_preenchida(p_entradas jsonb, p_celulas jsonb)
returns boolean
language sql immutable
as $$
  select exists (
    select 1 from jsonb_array_elements_text(p_celulas) c
     where coalesce(p_entradas ->> c, '') <> ''
  )
$$;

-- Regras (geradas — não editar à mão: rodar tools/fichas/contagem_regras.py --sql)
delete from public.contagem_regras;
insert into public.contagem_regras (ficha_codigo, atividade, modo, unidades, ordem) values
  ('FR-IMOB-06', 'Massa específica de agregados', 'unidades', '[["H13", "H14", "H15", "H16", "H17"],
     ["I13", "I14", "I15", "I16", "I17"]]'::jsonb, 1),
  ('FR-IMOB-07', 'Massa específica de agregados', 'unidades', '[["F13", "F14", "F15", "F16", "F17"],
     ["G13", "G14", "G15", "G16", "G17"]]'::jsonb, 2),
  ('FR-LAB-01', 'Massa específica de agregados', 'unidades', '[["E10", "E11", "E12", "E13", "E14"],
     ["F10", "F11", "F12", "F13", "F14"]]'::jsonb, 3),
  ('FR-LAB-02', 'Massa específica de agregados', 'unidades', '[["G17", "G18", "G19", "G20", "G21"],
     ["H17", "H18", "H19", "H20", "H21"]]'::jsonb, 4),
  ('FR-IMOB-08', 'Equivalente de areia', 'unidades', '[["F13", "F14"],
     ["G13", "G14"],
     ["H13", "H14"]]'::jsonb, 5),
  ('FR-IMOB-10', 'Rice test', 'unidades', '[["H15", "H17"],
     ["I15", "I17"],
     ["J15", "J17"]]'::jsonb, 6),
  ('FR-IMOB-11', 'Granulometria', 'unidades', '[["I25", "F29", "F30", "F31", "F32", "F33", "F34", "F35", "F36", "F37", "F38", "F39", "F40", "F41"],
     ["R25", "O29", "O30", "O31", "O32", "O33", "O34", "O35", "O36", "O37", "O38", "O39", "O40", "O41"]]'::jsonb, 7),
  ('FR-IMOB-12', 'Granulometria', 'unidades', '[["D20", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28", "D29", "D30", "D31", "D32"],
     ["H20", "H21", "H22", "H23", "H24", "H25", "H26", "H27", "H28", "H29", "H30", "H31", "H32", "J20", "J21", "J22", "J23"]]'::jsonb, 8),
  ('FR-IMOB-21', 'Granulometria', 'unidades', '[["D20", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28", "D29", "D30"],
     ["H20", "H21", "H22", "H23", "H24", "H25", "H26", "H27", "H28", "H29", "H30"]]'::jsonb, 9),
  ('FR-IMOB-44', 'Granulometria', 'unidades', '[["D20", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28", "D29", "D30"],
     ["H20", "H21", "H22", "H23", "H24", "H25", "H26", "H27", "H28", "H29", "H30"]]'::jsonb, 10),
  ('FR-IMOB-45', 'Granulometria', 'unidades', '[["D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28", "D29"],
     ["H21", "H22", "H23", "H24", "H25", "H26", "H27", "H28", "H29"]]'::jsonb, 11),
  ('FR-IMOB-47', 'Granulometria', 'unidades', '[["D20", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28"],
     ["H20", "H21", "H22", "H23", "H24", "H25", "H26", "H27", "H28"]]'::jsonb, 12),
  ('FR-IMOB-53', 'Granulometria', 'unidades', '[["G23", "D27", "D28", "D29", "D30", "D31", "D32", "D34", "D35", "D36", "D37", "D38", "D39", "D40", "D42"],
     ["P23", "M27", "M28", "M29", "M30", "M31", "M32", "M34", "M35", "M36", "M37", "M38", "M39", "M40", "M42"]]'::jsonb, 13),
  ('FR-IMOB-54', 'Granulometria', 'unidades', '[["D20", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28", "D29", "D30", "D31", "D32", "D33", "D34"],
     ["H20", "H21", "H22", "H23", "H24", "H25", "H26", "H27", "H28", "H29", "H30", "H31", "H32", "H33", "H34"]]'::jsonb, 14),
  ('FR-IMOB-13', 'Marshall', 'unidades', '[["D18", "D19", "D20", "D21", "D23", "D24", "D25", "D26", "D29", "D30"],
     ["F18", "F19", "F20", "F21", "F23", "F24", "F25", "F26", "F29", "F30"],
     ["H18", "H19", "H20", "H21", "H23", "H24", "H25", "H26", "H29", "H30"],
     ["J18", "J19", "J20", "J21", "J23", "J24", "J25", "J26", "J29", "J30"],
     ["L18", "L19", "L20", "L21", "L23", "L24", "L25", "L26", "L29", "L30"],
     ["N18", "N19", "N20", "N21", "N23", "N24", "N25", "N26", "N29", "N30"]]'::jsonb, 15),
  ('FR-IMOB-16', 'Marshall', 'unidades', '[["D19", "D20", "D21", "D22", "D24", "D25", "D26", "D27", "D30", "D31", "D32"],
     ["E19", "E20", "E21", "E22", "E24", "E25", "E26", "E27", "E30", "E31", "E32"],
     ["F19", "F20", "F21", "F22", "F24", "F25", "F26", "F27", "F30", "F31", "F32"],
     ["G19", "G20", "G21", "G22", "G24", "G25", "G26", "G27", "G30", "G31", "G32"]]'::jsonb, 16),
  ('FR-IMOB-14', 'Caracterização de ligante', 'unidades', '[["I20", "I32", "M20", "M32", "P20", "P32"],
     ["I28", "I40", "M28", "M40"],
     ["I23", "I24", "I35", "I36", "M23", "M24", "M35", "M36", "P23", "P24", "P35", "P36"],
     ["I43", "I45", "I47", "M43", "M45", "M47", "P43", "P45", "P47"],
     ["G53", "G54", "G55"],
     ["G56"]]'::jsonb, 17),
  ('FR-IMOB-15', 'Caracterização de ligante', 'unidades', '[["I20", "I32", "L20", "L32", "O20", "O32"],
     ["I28", "I40", "L28", "L40"],
     ["I23", "I24", "I35", "I36", "L23", "L24", "L35", "L36", "O23", "O24", "O35", "O36"],
     ["I43", "I45", "I47", "L43", "L45", "L47", "O43", "O45", "O47"],
     ["G53", "G54", "G55"],
     ["G56"]]'::jsonb, 18),
  ('FR-IMOB-18', 'Caracterização de ligante', 'unidades', '[["E20", "E24", "F20", "F24", "G20", "G24"],
     ["E22", "E26", "F22", "F26"],
     ["E28", "E29", "E30", "F28", "F29", "F30"],
     ["F36", "F37", "F38"],
     ["F39"]]'::jsonb, 19),
  ('FR-IMOB-17', 'DUI', 'uma', '[["D20", "D21", "D22", "D23", "D25", "D26", "D27", "D28", "D32"],
     ["E20", "E21", "E22", "E23", "E25", "E26", "E27", "E28", "E32"],
     ["F20", "F21", "F22", "F23", "F25", "F26", "F27", "F28", "F32"],
     ["G20", "G21", "G22", "G23", "G25", "G26", "G27", "G28", "G32"],
     ["H20", "H21", "H22", "H23", "H25", "H26", "H27", "H28", "H32"],
     ["I20", "I21", "I22", "I23", "I25", "I26", "I27", "I28", "I32"]]'::jsonb, 20),
  ('FR-IMOB-19', 'Estudo de composição granulométrica', 'unidades', '[["D15", "D18", "D19", "D20", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28"],
     ["F15", "F18", "F19", "F20", "F21", "F22", "F23", "F24", "F25", "F26", "F27", "F28"],
     ["H15", "H18", "H19", "H20", "H21", "H22", "H23", "H24", "H25", "H26", "H27", "H28"],
     ["J15", "J18", "J19", "J20", "J21", "J22", "J23", "J24", "J25", "J26", "J27", "J28"],
     ["L15", "L18", "L19", "L20", "L21", "L22", "L23", "L24", "L25", "L26", "L27", "L28"],
     ["N15", "N18", "N19", "N20", "N21", "N22", "N23", "N24", "N25", "N26", "N27", "N28"]]'::jsonb, 21),
  ('FR-IMOB-25', 'Estudo de composição granulométrica', 'unidades', '[["D15", "D18", "D19", "D20", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28", "D29", "D30", "D31", "D32"],
     ["G15", "G18", "G19", "G20", "G21", "G22", "G23", "G24", "G25", "G26", "G27", "G28", "G29", "G30", "G31", "G32"],
     ["J15", "J18", "J19", "J20", "J21", "J22", "J23", "J24", "J25", "J26", "J27", "J28", "J29", "J30", "J31", "J32"],
     ["M15", "M18", "M19", "M20", "M21", "M22", "M23", "M24", "M25", "M26", "M27", "M28", "M29", "M30", "M31", "M32"],
     ["P15", "P18", "P19", "P20", "P21", "P22", "P23", "P24", "P25", "P26", "P27", "P28", "P29", "P30", "P31", "P32"],
     ["S15", "S18", "S19", "S20", "S21", "S22", "S23", "S24", "S25", "S26", "S27", "S28", "S29", "S30", "S31", "S32"]]'::jsonb, 22),
  ('FR-IMOB-20', 'Estudo de dosagem', 'uma', '[["G16", "I16", "K16", "M16", "O16", "Q16"],
     ["D17", "D18", "D19", "D20", "D21", "D22", "D23", "D24"]]'::jsonb, 23),
  ('FR-IMOB-22', 'Extração de teor', 'unidades', '[["F16", "F17", "F18"],
     ["G16", "G17", "G18"],
     ["F24", "F25"],
     ["G24", "G25"]]'::jsonb, 24),
  ('FR-IMOB-23', 'Densidade real', 'unidades', '[["F15", "F16", "F17"],
     ["G15", "G16", "G17"]]'::jsonb, 25),
  ('FR-IMOB-24', 'Densidade relativa (produtos betuminosos)', 'unidades', '[["F15", "F16", "F17", "F18"],
     ["G15", "G16", "G17", "G18"]]'::jsonb, 26),
  ('FR-IMOB-27', 'Adesividade', 'uma', '[]'::jsonb, 27),
  ('FR-IMOB-28', 'Curva viscosidade × temperatura', 'uma', '[["D16", "E16", "F16"],
     ["D17", "E17", "F17"],
     ["D18", "E18", "F18"]]'::jsonb, 28),
  ('FR-IMOB-29', 'Viga Benkelman', 'unidades', '[["E20", "F20", "G20"],
     ["E21", "F21", "G21"],
     ["E22", "F22", "G22"],
     ["E23", "F23", "G23"],
     ["E24", "F24", "G24"],
     ["E25", "F25", "G25"],
     ["E26", "F26", "G26"],
     ["E27", "F27", "G27"],
     ["E28", "F28", "G28"],
     ["E29", "F29", "G29"],
     ["E30", "F30", "G30"],
     ["E31", "F31", "G31"],
     ["E32", "F32", "G32"],
     ["E33", "F33", "G33"],
     ["E34", "F34", "G34"],
     ["E35", "F35", "G35"],
     ["E36", "F36", "G36"],
     ["E37", "F37", "G37"],
     ["E38", "F38", "G38"],
     ["E39", "F39", "G39"],
     ["E40", "F40", "G40"]]'::jsonb, 29),
  ('FR-IMOB-30', 'Macrotextura', 'unidades', '[["H16", "I16", "J16", "K16"],
     ["H17", "I17", "J17", "K17"],
     ["H18", "I18", "J18", "K18"],
     ["H19", "I19", "J19", "K19"],
     ["H20", "I20", "J20", "K20"],
     ["H21", "I21", "J21", "K21"],
     ["H22", "I22", "J22", "K22"],
     ["H23", "I23", "J23", "K23"],
     ["H24", "I24", "J24", "K24"],
     ["H25", "I25", "J25", "K25"],
     ["H26", "I26", "J26", "K26"],
     ["H27", "I27", "J27", "K27"],
     ["H28", "I28", "J28", "K28"],
     ["H29", "I29", "J29", "K29"],
     ["H30", "I30", "J30", "K30"]]'::jsonb, 30),
  ('FR-IMOB-31', 'Índice de forma', 'unidades', '[["E18", "G18", "J18", "E19", "G19", "J19", "E20", "G20", "J20"],
     ["E28", "G28", "J28", "E29", "G29", "J29"]]'::jsonb, 31),
  ('FR-IMOB-32', 'Densidade máxima e umidade ótima', 'unidades', '[["D21", "D22", "D32"],
     ["E21", "E22", "E32"],
     ["F21", "F22", "F32"],
     ["G21", "G22", "G32"],
     ["H21", "H22", "H32"],
     ["I21", "I22", "I32"]]'::jsonb, 32),
  ('FR-IMOB-33', 'Compressão axial e diametral', 'unidades', '[["F26", "G26", "H26"],
     ["F27", "G27", "H27"],
     ["F28", "G28", "H28"],
     ["F29", "G29", "H29"],
     ["F34", "G34", "H34"],
     ["F35", "G35", "H35"],
     ["F36", "G36", "H36"],
     ["F37", "G37", "H37"]]'::jsonb, 33),
  ('FR-IMOB-34', 'Granulometria', 'uma', '[["I18", "I19", "K18", "K19"],
     ["E30", "E31", "E32", "E33", "E34", "E35", "E36"]]'::jsonb, 34),
  ('FR-IMOB-35', 'Grau de compactação (frasco de areia)', 'unidades', '[["D19", "D20", "D32", "D41"],
     ["E19", "E20", "E32", "E41"],
     ["F19", "F20", "F32", "F41"],
     ["G19", "G20", "G32", "G41"],
     ["H19", "H20", "H32", "H41"]]'::jsonb, 35),
  ('FR-IMOB-36', 'Comparativo SDG × frasco de areia', 'unidades', '[["G16", "H16", "I16", "K16", "L16", "M16"],
     ["G17", "H17", "I17", "K17", "L17", "M17"],
     ["G18", "H18", "I18", "K18", "L18", "M18"],
     ["G19", "H19", "I19", "K19", "L19", "M19"],
     ["G20", "H20", "I20", "K20", "L20", "M20"],
     ["G21", "H21", "I21", "K21", "L21", "M21"],
     ["G22", "H22", "I22", "K22", "L22", "M22"],
     ["G23", "H23", "I23", "K23", "L23", "M23"],
     ["G24", "H24", "I24", "K24", "L24", "M24"],
     ["G25", "H25", "I25", "K25", "L25", "M25"],
     ["G26", "H26", "I26", "K26", "L26", "M26"],
     ["G27", "H27", "I27", "K27", "L27", "M27"],
     ["G28", "H28", "I28", "K28", "L28", "M28"],
     ["G29", "H29", "I29", "K29", "L29", "M29"],
     ["G30", "H30", "I30", "K30", "L30", "M30"],
     ["G31", "H31", "I31", "K31", "L31", "M31"],
     ["G32", "H32", "I32", "K32", "L32", "M32"],
     ["G33", "H33", "I33", "K33", "L33", "M33"],
     ["G34", "H34", "I34", "K34", "L34", "M34"]]'::jsonb, 36),
  ('FR-IMOB-37', 'Índice de forma', 'uma', '[["C16", "D16", "C17", "D17", "C18", "D18", "C19", "D19", "C20", "D20", "C21", "D21", "C22", "D22", "C23", "D23", "C24", "D24", "C25", "D25", "C26", "D26", "C27", "D27", "C28", "D28", "C29", "D29", "C30", "D30", "C31", "D31", "C32", "D32", "C33", "D33", "C34", "D34", "C35", "D35", "C36", "D36", "C37", "D37", "C38", "D38", "C39", "D39", "C40", "D40"],
     ["C41", "D41", "C42", "D42", "C43", "D43", "C44", "D44", "C45", "D45", "C46", "D46", "C47", "D47", "C48", "D48", "C49", "D49", "C50", "D50", "C51", "D51", "C52", "D52", "C53", "D53", "C54", "D54", "C55", "D55", "C56", "D56", "C57", "D57", "C58", "D58", "C59", "D59", "C60", "D60", "C61", "D61", "C62", "D62", "C63", "D63", "C64", "D64", "C65", "D65"],
     ["C66", "D66", "C67", "D67", "C68", "D68", "C69", "D69", "C70", "D70", "C71", "D71", "C72", "D72", "C73", "D73", "C74", "D74", "C75", "D75", "C76", "D76", "C77", "D77", "C78", "D78", "C79", "D79", "C80", "D80", "C81", "D81", "C82", "D82", "C83", "D83", "C84", "D84", "C85", "D85", "C86", "D86", "C87", "D87", "C88", "D88", "C89", "D89", "C90", "D90"],
     ["C91", "D91", "C92", "D92", "C93", "D93", "C94", "D94", "C95", "D95", "C96", "D96", "C97", "D97", "C98", "D98", "C99", "D99", "C100", "D100", "C101", "D101", "C102", "D102", "C103", "D103", "C104", "D104", "C105", "D105", "C106", "D106", "C107", "D107", "C108", "D108", "C109", "D109", "C110", "D110", "C111", "D111", "C112", "D112", "C113", "D113", "C114", "D114", "C115", "D115"],
     ["G16", "H16", "G17", "H17", "G18", "H18", "G19", "H19", "G20", "H20", "G21", "H21", "G22", "H22", "G23", "H23", "G24", "H24", "G25", "H25", "G26", "H26", "G27", "H27", "G28", "H28", "G29", "H29", "G30", "H30", "G31", "H31", "G32", "H32", "G33", "H33", "G34", "H34", "G35", "H35", "G36", "H36", "G37", "H37", "G38", "H38", "G39", "H39", "G40", "H40"],
     ["G41", "H41", "G42", "H42", "G43", "H43", "G44", "H44", "G45", "H45", "G46", "H46", "G47", "H47", "G48", "H48", "G49", "H49", "G50", "H50", "G51", "H51", "G52", "H52", "G53", "H53", "G54", "H54", "G55", "H55", "G56", "H56", "G57", "H57", "G58", "H58", "G59", "H59", "G60", "H60", "G61", "H61", "G62", "H62", "G63", "H63", "G64", "H64", "G65", "H65"],
     ["G66", "H66", "G67", "H67", "G68", "H68", "G69", "H69", "G70", "H70", "G71", "H71", "G72", "H72", "G73", "H73", "G74", "H74", "G75", "H75", "G76", "H76", "G77", "H77", "G78", "H78", "G79", "H79", "G80", "H80", "G81", "H81", "G82", "H82", "G83", "H83", "G84", "H84", "G85", "H85", "G86", "H86", "G87", "H87", "G88", "H88", "G89", "H89", "G90", "H90"],
     ["G91", "H91", "G92", "H92", "G93", "H93", "G94", "H94", "G95", "H95", "G96", "H96", "G97", "H97", "G98", "H98", "G99", "H99", "G100", "H100", "G101", "H101", "G102", "H102", "G103", "H103", "G104", "H104", "G105", "H105", "G106", "H106", "G107", "H107", "G108", "H108", "G109", "H109", "G110", "H110", "G111", "H111", "G112", "H112", "G113", "H113", "G114", "H114", "G115", "H115"]]'::jsonb, 37),
  ('FR-IMOB-38', 'Controle de espessuras', 'unidades', '[["F15"],
     ["F16"],
     ["F17"],
     ["F18"],
     ["F19"],
     ["F20"],
     ["F21"],
     ["F22"],
     ["F23"],
     ["F24"],
     ["F25"],
     ["F26"],
     ["F27"],
     ["F28"],
     ["F29"],
     ["F30"],
     ["F31"],
     ["F32"],
     ["F33"],
     ["F34"],
     ["F35"],
     ["F36"],
     ["F37"],
     ["F38"],
     ["F39"]]'::jsonb, 38),
  ('FR-IMOB-46', 'Densidade aparente e grau de compactação', 'unidades', '[["M19", "N19", "O19", "P19"],
     ["M20", "N20", "O20", "P20"],
     ["M21", "N21", "O21", "P21"],
     ["M22", "N22", "O22", "P22"],
     ["M23", "N23", "O23", "P23"],
     ["M24", "N24", "O24", "P24"],
     ["M25", "N25", "O25", "P25"],
     ["M26", "N26", "O26", "P26"],
     ["M27", "N27", "O27", "P27"],
     ["M28", "N28", "O28", "P28"],
     ["M29", "N29", "O29", "P29"],
     ["M30", "N30", "O30", "P30"],
     ["M31", "N31", "O31", "P31"],
     ["M32", "N32", "O32", "P32"],
     ["M33", "N33", "O33", "P33"],
     ["M34", "N34", "O34", "P34"],
     ["M35", "N35", "O35", "P35"],
     ["M36", "N36", "O36", "P36"],
     ["M37", "N37", "O37", "P37"],
     ["M38", "N38", "O38", "P38"],
     ["M39", "N39", "O39", "P39"]]'::jsonb, 39),
  ('FR-IMOB-48', 'Resíduo seco', 'unidades', '[["N14", "N15", "N16"],
     ["S14", "S15", "S16"]]'::jsonb, 40),
  ('FR-IMOB-49', 'Resistência à derrapagem', 'unidades', '[["H16", "I16", "J16", "K16", "L16"],
     ["H17", "I17", "J17", "K17", "L17"],
     ["H18", "I18", "J18", "K18", "L18"],
     ["H19", "I19", "J19", "K19", "L19"],
     ["H20", "I20", "J20", "K20", "L20"],
     ["H21", "I21", "J21", "K21", "L21"],
     ["H22", "I22", "J22", "K22", "L22"],
     ["H23", "I23", "J23", "K23", "L23"],
     ["H24", "I24", "J24", "K24", "L24"],
     ["H25", "I25", "J25", "K25", "L25"]]'::jsonb, 41),
  ('FR-IMOB-50', 'Compressão axial e diametral', 'unidades', '[["W20"],
     ["W21"],
     ["X20"],
     ["X21"],
     ["W22"],
     ["W23"],
     ["X22"],
     ["X23"],
     ["W24"],
     ["W25"],
     ["X24"],
     ["X25"],
     ["W26"],
     ["W27"],
     ["X26"],
     ["X27"],
     ["W28"],
     ["W29"],
     ["X28"],
     ["X29"],
     ["W30"],
     ["W31"],
     ["X30"],
     ["X31"],
     ["W32"],
     ["W33"],
     ["X32"],
     ["X33"],
     ["W34"],
     ["W35"],
     ["X34"],
     ["X35"],
     ["W36"],
     ["W37"],
     ["X36"],
     ["X37"],
     ["W38"],
     ["W39"],
     ["X38"],
     ["X39"],
     ["W40"],
     ["W41"],
     ["X40"],
     ["X41"],
     ["W42"],
     ["W43"],
     ["X42"],
     ["X43"],
     ["W44"],
     ["W45"],
     ["X44"],
     ["X45"],
     ["W46"],
     ["W47"],
     ["X46"],
     ["X47"],
     ["W48"],
     ["W49"],
     ["X48"],
     ["X49"],
     ["W50"],
     ["W51"],
     ["X50"],
     ["X51"]]'::jsonb, 42),
  ('FR-IMOB-51', 'Módulo de resiliência', 'unidades', '[["C23", "E23", "G23", "I23", "C24", "E24", "G24", "I24", "C25", "E25", "G25", "I25", "C26", "E26", "G26", "I26", "C27", "E27", "G27", "I27"],
     ["K23", "N23", "P23", "R23", "K24", "N24", "P24", "R24", "K25", "N25", "P25", "R25", "K26", "N26", "P26", "R26", "K27", "N27", "P27", "R27"],
     ["T23", "W23", "X23", "Y23", "T24", "W24", "X24", "Y24", "T25", "W25", "X25", "Y25", "T26", "W26", "X26", "Y26", "T27", "W27", "X27", "Y27"]]'::jsonb, 43),
  ('FR-IMOB-52', 'Módulo de resiliência', 'unidades', '[["C20", "E20", "G20", "I20", "C21", "E21", "G21", "I21", "C22", "E22", "G22", "I22", "C23", "E23", "G23", "I23", "C24", "E24", "G24", "I24", "C25", "E25", "G25", "I25", "C26", "E26", "G26", "I26", "C27", "E27", "G27", "I27", "C28", "E28", "G28", "I28", "C29", "E29", "G29", "I29", "C30", "E30", "G30", "I30", "C31", "E31", "G31", "I31", "C32", "E32", "G32", "I32", "C33", "E33", "G33", "I33", "C34", "E34", "G34", "I34", "C35", "E35", "G35", "I35", "C36", "E36", "G36", "I36", "C37", "E37", "G37", "I37"],
     ["K20", "M20", "O20", "Q20", "K21", "M21", "O21", "Q21", "K22", "M22", "O22", "Q22", "K23", "M23", "O23", "Q23", "K24", "M24", "O24", "Q24", "K25", "M25", "O25", "Q25", "K26", "M26", "O26", "Q26", "K27", "M27", "O27", "Q27", "K28", "M28", "O28", "Q28", "K29", "M29", "O29", "Q29", "K30", "M30", "O30", "Q30", "K31", "M31", "O31", "Q31", "K32", "M32", "O32", "Q32", "K33", "M33", "O33", "Q33", "K34", "M34", "O34", "Q34", "K35", "M35", "O35", "Q35", "K36", "M36", "O36", "Q36", "K37", "M37", "O37", "Q37"],
     ["S20", "U20", "W20", "Y20", "S21", "U21", "W21", "Y21", "S22", "U22", "W22", "Y22", "S23", "U23", "W23", "Y23", "S24", "U24", "W24", "Y24", "S25", "U25", "W25", "Y25", "S26", "U26", "W26", "Y26", "S27", "U27", "W27", "Y27", "S28", "U28", "W28", "Y28", "S29", "U29", "W29", "Y29", "S30", "U30", "W30", "Y30", "S31", "U31", "W31", "Y31", "S32", "U32", "W32", "Y32", "S33", "U33", "W33", "Y33", "S34", "U34", "W34", "Y34", "S35", "U35", "W35", "Y35", "S36", "U36", "W36", "Y36", "S37", "U37", "W37", "Y37"]]'::jsonb, 44),
  ('FR-LAB-51', 'Módulo de resiliência', 'unidades', '[["C24", "E24", "G24", "I24", "C25", "E25", "G25", "I25", "C26", "E26", "G26", "I26", "C27", "E27", "G27", "I27", "C28", "E28", "G28", "I28", "C29", "E29", "G29", "I29", "C30", "E30", "G30", "I30", "C31", "E31", "G31", "I31", "C32", "E32", "G32", "I32", "C33", "E33", "G33", "I33", "C34", "E34", "G34", "I34", "C35", "E35", "G35", "I35", "C36", "E36", "G36", "I36", "C37", "E37", "G37", "I37", "C38", "E38", "G38", "I38", "C39", "E39", "G39", "I39", "C40", "E40", "G40", "I40", "C41", "E41", "G41", "I41"],
     ["K24", "M24", "O24", "Q24", "K25", "M25", "O25", "Q25", "K26", "M26", "O26", "Q26", "K27", "M27", "O27", "Q27", "K28", "M28", "O28", "Q28", "K29", "M29", "O29", "Q29", "K30", "M30", "O30", "Q30", "K31", "M31", "O31", "Q31", "K32", "M32", "O32", "Q32", "K33", "M33", "O33", "Q33", "K34", "M34", "O34", "Q34", "K35", "M35", "O35", "Q35", "K36", "M36", "O36", "Q36", "K37", "M37", "O37", "Q37", "K38", "M38", "O38", "Q38", "K39", "M39", "O39", "Q39", "K40", "M40", "O40", "Q40", "K41", "M41", "O41", "Q41"],
     ["S24", "U24", "W24", "Y24", "S25", "U25", "W25", "Y25", "S26", "U26", "W26", "Y26", "S27", "U27", "W27", "Y27", "S28", "U28", "W28", "Y28", "S29", "U29", "W29", "Y29", "S30", "U30", "W30", "Y30", "S31", "U31", "W31", "Y31", "S32", "U32", "W32", "Y32", "S33", "U33", "W33", "Y33", "S34", "U34", "W34", "Y34", "S35", "U35", "W35", "Y35", "S36", "U36", "W36", "Y36", "S37", "U37", "W37", "Y37", "S38", "U38", "W38", "Y38", "S39", "U39", "W39", "Y39", "S40", "U40", "W40", "Y40", "S41", "U41", "W41", "Y41"]]'::jsonb, 45),
  ('FR-IMOB-55', 'Densidade máxima e umidade ótima', 'unidades', '[["D20", "D21", "D31"],
     ["E20", "E21", "E31"],
     ["F20", "F21", "F31"],
     ["G20", "G21", "G31"],
     ["H20", "H21", "H31"],
     ["I20", "I21", "I31"]]'::jsonb, 46),
  ('FR-IMOB-55', 'Índice de suporte Califórnia', 'unidades', '[["C103", "C104", "C105", "C106", "C107", "C108", "C109", "C110"],
     ["C122", "C123", "C124", "C125", "C126", "C127", "C128", "C129"],
     ["C141", "C142", "C143", "C144", "C145", "C146", "C147", "C148"]]'::jsonb, 47),
  ('FR-IMOB-55', 'Expansão de solos', 'unidades', '[["D95", "D96", "D97", "D98"],
     ["D114", "D115", "D116", "D117"],
     ["D133", "D134", "D135", "D136"]]'::jsonb, 48),
  ('FR-IMOB-55', 'Granulometria', 'uma', '[["C168", "C169", "D168", "D169", "D178", "G169", "G170", "G171", "G172", "G173", "G174", "G175", "G177", "G180", "G182"]]'::jsonb, 49),
  ('FR-IMOB-55', 'Índices físicos – LL e LP', 'uma', '[["C200", "C201", "C206", "D200", "D201", "D206", "E200", "E201", "E206", "F200", "F201", "F206", "G200", "G201", "G206"],
     ["H200", "H201", "I200", "I201", "J200", "J201", "K200", "K201", "L200", "L201"]]'::jsonb, 50),
  ('FR-IMOB-55', 'Equivalente de areia', 'uma', '[["K217", "K218", "L217", "L218"]]'::jsonb, 51),
  ('FR-IMOB-56', 'Calibração da areia (massa específica aparente)', 'unidades', '[["H15", "H16", "H17"],
     ["I15", "I16", "I17"],
     ["J15", "J16", "J17"]]'::jsonb, 52),
  ('FR-IMOB-57', 'Densidade in situ (densímetro não nuclear)', 'unidades', '[["K14"],
     ["K15"],
     ["K16"],
     ["K17"],
     ["K18"],
     ["K19"],
     ["K20"],
     ["K21"],
     ["K22"],
     ["K23"],
     ["K24"],
     ["K25"],
     ["K26"],
     ["K27"],
     ["K28"],
     ["K29"],
     ["K30"],
     ["K31"],
     ["K32"],
     ["K33"]]'::jsonb, 53)
on conflict (ficha_codigo, atividade) do update
  set modo = excluded.modo, unidades = excluded.unidades, ordem = excluded.ordem;

-- -----------------------------------------------------------------------------
-- View
-- -----------------------------------------------------------------------------
-- Entradas de cada folha da ficha: a folha 1 (dados_resultado.entradas) e as folhas adicionais
-- (dados_resultado.folhas_extras[].entradas — 20/10/2026).
create or replace function public._contagem_folhas(p_dados jsonb)
returns table (entradas jsonb)
language sql immutable
as $$
  select coalesce(p_dados -> 'entradas', '{}'::jsonb)
  union all
  select coalesce(f -> 'entradas', '{}'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'folhas_extras') = 'array'
                                   then p_dados -> 'folhas_extras' else '[]'::jsonb end) f
$$;

drop view if exists public.contagem_atividades;
create view public.contagem_atividades
with (security_invoker = true) as
with os as (
  select p.*
    from public.pedidos_ensaio p
   where p.numero_os is not null
     and p.status <> 'cancelado'
),
amostras as (
  select os.id as pedido_id, a
    from os, jsonb_array_elements(case when jsonb_typeof(os.dados_amostra) = 'array'
                                       then os.dados_amostra else '[]'::jsonb end) a
),
por_ficha as (
  -- cada folha da ficha (folha 1 + folhas_extras — 20/10/2026) conta; 'uma' vale 1 por ensaio
  select e.pedido_id, e.id as ensaio_os_id, e.status as status_ensaio,
         f.codigo as ficha, r.atividade, r.ordem,
         case
           when r.modo = 'uma' and jsonb_array_length(r.unidades) = 0 then
             case when e.status in ('aguardando_revisao', 'aprovado') then 1 else 0 end
           when r.modo = 'uma' then
             case when exists (select 1 from public._contagem_folhas(e.dados_resultado) fl,
                                             jsonb_array_elements(r.unidades) u
                                where public._contagem_preenchida(fl.entradas, u))
                  then 1 else 0 end
           else
             (select count(*)::int from public._contagem_folhas(e.dados_resultado) fl,
                                        jsonb_array_elements(r.unidades) u
               where public._contagem_preenchida(fl.entradas, u))
         end as quantidade
    from public.ensaios_os e
    join os on os.id = e.pedido_id
    join public.fichas_modelo m on m.id = e.ficha_modelo_id
    join public.fichas_ensaio f on f.id = m.ficha_ensaio_id
    join public.contagem_regras r on r.ficha_codigo = f.codigo
),
moldagem as (
  -- concreto: só os CPs moldados pela CNRO
  select am.pedido_id, null::uuid as ensaio_os_id, null::text as status_ensaio, null::text as ficha,
         'CP''s de concreto'::text as atividade, 1000 as ordem, count(*)::int as quantidade
    from amostras am
    join os on os.id = am.pedido_id
   where os.material = 'concreto'
     and coalesce(am.a ->> 'responsavel_moldagem', am.a -> 'info_geral' ->> 'responsavel_moldagem') = 'CNRO'
   group by am.pedido_id
  union all
  -- solo-cimento: sempre moldado no laboratório
  select am.pedido_id, null, null, null, 'CP''s solo cimento', 1001, count(*)::int
    from amostras am
    join os on os.id = am.pedido_id
   where os.sub_tipo = 'cps_solo_cimento'
   group by am.pedido_id
)
select os.id            as pedido_id,
       os.numero_os,
       os.empresa,
       os.empresa_id,
       os.lote,
       os.material,
       os.status        as status_pedido,
       os.aberto_em,
       os.finalizado_em,
       x.ensaio_os_id,
       x.status_ensaio,
       x.ficha,
       x.atividade,
       x.quantidade,
       x.ordem
  from (select * from por_ficha union all select * from moldagem) x
  join os on os.id = x.pedido_id
 where x.quantidade > 0;

comment on view public.contagem_atividades is
  'Contagem de ensaios por atividade (CP, determinação, ponto…) por O.S. — migração 27, regras em contagem_regras.';

grant select on public.contagem_atividades to authenticated;

commit;
