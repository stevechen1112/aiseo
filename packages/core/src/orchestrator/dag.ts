import YAML from 'yaml';

export type DagNode = {
  id: string;
  dependsOn?: string[];
};

export type DagDefinition = {
  nodes: DagNode[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function parseDagYaml(yamlText: string): DagDefinition {
  const parsed = YAML.parse(yamlText) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('Invalid DAG YAML');
  }

  const nodes = parsed.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error('DAG YAML must contain nodes: []');
  }

  const normalized: DagNode[] = nodes.map((node: unknown) => {
    if (!isRecord(node) || typeof node.id !== 'string') {
      throw new Error('Each DAG node must have string id');
    }
    const dependsOn = node.dependsOn;
    if (dependsOn !== undefined && !Array.isArray(dependsOn)) {
      throw new Error(`Node ${node.id}: dependsOn must be string[]`);
    }
    return {
      id: node.id,
      dependsOn: dependsOn?.map(String) ?? [],
    };
  });

  detectCycles(normalized);

  return { nodes: normalized };
}

export function detectCycles(nodes: DagNode[]) {
  const graph = new Map<string, string[]>();
  for (const node of nodes) {
    if (graph.has(node.id)) {
      throw new Error(`Duplicate node id: ${node.id}`);
    }
    graph.set(node.id, node.dependsOn ?? []);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string, stack: string[]) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id);
      const cycle = stack.slice(cycleStart).concat(id);
      throw new Error(`Cycle detected: ${cycle.join(' -> ')}`);
    }

    visiting.add(id);
    stack.push(id);

    const deps = graph.get(id);
    if (!deps) {
      throw new Error(`Node not found: ${id}`);
    }

    for (const dep of deps) {
      if (!graph.has(dep)) {
        throw new Error(`Missing dependency node: ${dep} (required by ${id})`);
      }
      visit(dep, stack);
    }

    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of graph.keys()) {
    visit(id, []);
  }
}
