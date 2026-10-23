(Ciclo G71 de desbaste y G70 de acabado sobre Ø50 x 100)
G21 G18 G98
T0101 (desbaste exterior)
S900 M03
G00 X52 Z2 (punto de inicio del ciclo)
G71 U2 R1 (2 mm por pasada en radio, retracción 1 mm)
G71 P10 Q50 U0.4 W0.1 F150 (sobremedida 0,4 en diámetro y 0,1 en Z)
N10 G00 X20
N20 G01 Z-10 F80
N30 X30 Z-20
N40 Z-35
N50 X50 Z-40
T0202 (acabado exterior)
G00 X52 Z2
G70 P10 Q50
G00 X60 Z5
M05
M30
