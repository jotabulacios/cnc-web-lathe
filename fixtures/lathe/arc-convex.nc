(Redondeo convexo R5 en la esquina del frente: desbaste y acabado)
G21 G18 G98
T0101 (desbaste exterior 80 grados)
S1000 M03
G00 X54 Z2
G01 X41 F150 (deja 0,5 mm en radio para el acabado)
Z-30
G00 X54 Z2
T0202 (acabado 55 grados)
S1200
G00 X30 Z2
G01 Z0 F80
G03 X40 Z-5 I0 K-5 (redondeo R5: centro 5 mm hacia el plato)
G01 Z-30
G00 X54
X60 Z5
M05
M30
