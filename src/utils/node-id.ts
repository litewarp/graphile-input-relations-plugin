import type {PgResource} from 'postgraphile/@dataplan/pg';
import type {NodeIdHandler} from 'postgraphile/grafast';

export function decodeNodeId(
  handler: NodeIdHandler,
  nodeId: unknown,
  resource: PgResource
): [string, string | number][] | null {
  const primaryUniq = resource.uniques.find((u) => u.isPrimary);
  if (!primaryUniq) return null;
  const pk = primaryUniq.attributes;
  let decoded: string | number[] = [];
  try {
    decoded = handler.codec.decode(String(nodeId));
  } catch {
    return null;
  }

  if (!handler.match(decoded)) {
    throw new Error("Types don't match");
  }

  return pk.map((attr, idx) => [attr, decoded[idx + 1]]);
}
