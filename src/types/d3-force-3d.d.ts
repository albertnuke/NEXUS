declare module 'd3-force-3d' {
  export interface SimNode {
    index?: number
    x?: number
    y?: number
    z?: number
    vx?: number
    vy?: number
    vz?: number
    fx?: number | null
    fy?: number | null
    fz?: number | null
    [key: string]: unknown
  }
  export interface SimLink<N extends SimNode = SimNode> {
    source: N | string | number
    target: N | string | number
    [key: string]: unknown
  }
  export interface Force<N extends SimNode = SimNode> {
    (alpha: number): void
    initialize?: (nodes: N[], ...args: unknown[]) => void
  }
  export interface Simulation<N extends SimNode = SimNode> {
    nodes(): N[]
    nodes(nodes: N[]): this
    alpha(): number
    alpha(a: number): this
    alphaMin(a: number): this
    alphaDecay(a: number): this
    alphaTarget(a: number): this
    velocityDecay(a: number): this
    force(name: string): Force<N> | undefined
    force(name: string, force: Force<N> | null): this
    randomSource(fn: () => number): this
    numDimensions(n: number): this
    tick(iterations?: number): this
    stop(): this
    on(type: string, cb: (() => void) | null): this
  }
  export function forceSimulation<N extends SimNode>(nodes?: N[], numDimensions?: number): Simulation<N>
  export interface LinkForce<N extends SimNode> extends Force<N> {
    id(fn: (n: N) => string): this
    distance(d: number | ((l: SimLink<N>) => number)): this
    strength(s: number | ((l: SimLink<N>) => number)): this
    iterations(n: number): this
    links(l: SimLink<N>[]): this
  }
  export function forceLink<N extends SimNode>(links?: SimLink<N>[]): LinkForce<N>
  export interface ManyBodyForce<N extends SimNode> extends Force<N> {
    strength(s: number | ((n: N) => number)): this
    theta(t: number): this
    distanceMin(d: number): this
    distanceMax(d: number): this
  }
  export function forceManyBody<N extends SimNode>(): ManyBodyForce<N>
}
