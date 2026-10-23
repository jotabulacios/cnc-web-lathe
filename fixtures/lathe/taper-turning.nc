(Cono exterior: dos pasadas de desbaste y acabado del cono, como en el taller)
G21 G18 G98
T0101 (desbaste exterior 80 grados)
S1000 M03
G00 X54 Z2
G01 X42 F150 (pasada 1: Ø42, termina antes de que el cono llegue a Ø42)
Z-29
G00 X54 Z2
G01 X36 (pasada 2: Ø36)
Z-14
G00 X54 Z2
T0202 (acabado 55 grados)
S1200
G00 X30 Z2
G01 Z0 F80
X46 Z-40 (cono de Ø30 en la cara a Ø46 en Z-40: crece hacia el plato)
G00 X54
X60 Z5
M05
M30
