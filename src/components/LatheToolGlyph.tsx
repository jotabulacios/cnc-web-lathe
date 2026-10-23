import type { ToolDefinition } from '../lib/lathe/tools';
import { assemblySvgPath, TOOL_ASSEMBLIES, type DisplayAssembly } from '../lib/lathe/toolAssemblies';

/** Millimeter geometry. Parent supplies physical scene scale or icon framing. */
export default function LatheToolGlyph({ tool, assembly = TOOL_ASSEMBLIES[tool.id] }: { tool: ToolDefinition; assembly?: DisplayAssembly }) {
  return <g aria-hidden="true" data-tool-shape={tool.geometry.type} data-assembly-id={assembly.id}>
    {assembly.parts.map((part, index) => <path key={index} d={assemblySvgPath(part)}
      fill={part.role === 'insert' ? tool.geometry.color : part.role === 'clamp' ? '#3a4550' : '#56626e'}
      stroke="#1f2730" strokeWidth="0.8" vectorEffect="non-scaling-stroke"/>)}
  </g>;
}
