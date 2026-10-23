// Deterministic educational programs; these cases never run a real machine.
const setup = lengthMm => ({ xConvention:'diameter',toolId:'generic-od',
  initialPosition:{rMm:30,zMm:5},stock:{diameterMm:50,lengthMm} });
export const benchmarkCases = [
  ...[100,1000,9000].map(count => ({
    id:`air-${count}`, count, setup:setup(100),
    source:['G21 G18 G98',...Array.from({length:count},(_,i)=>`G00 X60 Z${i%2?5:10}`),'M30'].join('\n')+'\n',
  })),
  ...[100,500,1000,1800].map(count => ({
    id:`contour-${count}`, count, setup:setup(count),
    source:['G21 G18 G98','S1000 M03','G00 X40 Z0',
      ...Array.from({length:count},(_,i)=>`G01 X${i%2?40:44} Z-${i+1} F120`),'M05','M30'].join('\n')+'\n',
  })),
];
