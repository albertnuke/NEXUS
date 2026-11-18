#!/usr/bin/env node
/**
 * Generates the bundled demo vault (resources/demo-vault). The demo is
 * clearly labelled as sample data inside NEXUS and is never presented as a
 * user's real vault. Content is general-knowledge reference material.
 */
import { mkdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'demo-vault')

/** [folder, title, summary, tags, links, sections] */
const T = [
  // Astronomy
  ['Astronomy', 'Black Holes', 'Regions of spacetime where gravity is so strong that nothing, not even light, can escape once it crosses the event horizon.', ['astronomy', 'relativity'], ['Event Horizon', 'Accretion Disks', 'General Relativity', 'Hawking Radiation', 'Gravitational Lensing', 'Stellar Evolution']],
  ['Astronomy', 'Event Horizon', 'The boundary around a black hole beyond which escape requires travelling faster than light.', ['astronomy'], ['Black Holes', 'Schwarzschild Radius']],
  ['Astronomy', 'Schwarzschild Radius', 'The radius of the event horizon of a non-rotating black hole: r = 2GM/c².', ['astronomy', 'math'], ['Event Horizon', 'General Relativity']],
  ['Astronomy', 'Accretion Disks', 'Rotating disks of gas and dust spiralling inward, heated by friction until they glow across the spectrum.', ['astronomy'], ['Black Holes', 'Doppler Beaming', 'Angular Momentum']],
  ['Astronomy', 'Doppler Beaming', 'Relativistic brightening of material moving toward the observer — why one side of an accretion disk looks brighter.', ['astronomy', 'relativity'], ['Accretion Disks', 'Special Relativity']],
  ['Astronomy', 'Gravitational Lensing', 'The bending of light by mass, producing arcs, rings and multiple images of distant sources.', ['astronomy', 'relativity'], ['General Relativity', 'Black Holes', 'Dark Matter']],
  ['Astronomy', 'Hawking Radiation', 'Theoretical thermal radiation emitted by black holes due to quantum effects near the horizon.', ['astronomy', 'quantum'], ['Black Holes', 'Entropy', 'Quantum Field Theory']],
  ['Astronomy', 'Stellar Evolution', 'The life cycle of stars, from collapsing clouds to white dwarfs, neutron stars or black holes.', ['astronomy'], ['Nuclear Fusion', 'Supernovae', 'Black Holes']],
  ['Astronomy', 'Supernovae', 'Stellar explosions that briefly outshine galaxies and seed space with heavy elements.', ['astronomy'], ['Stellar Evolution', 'Nucleosynthesis']],
  ['Astronomy', 'Nucleosynthesis', 'The creation of atomic nuclei — in the early universe, inside stars and in stellar explosions.', ['astronomy', 'chemistry'], ['Nuclear Fusion', 'Supernovae']],
  ['Astronomy', 'Nuclear Fusion', 'Light nuclei combining into heavier ones, releasing the energy that powers stars.', ['physics'], ['Stellar Evolution', 'Nucleosynthesis']],
  ['Astronomy', 'Dark Matter', 'Unseen mass inferred from galaxy rotation curves, lensing and cosmic structure.', ['astronomy', 'cosmology'], ['Gravitational Lensing', 'Cosmic Microwave Background']],
  ['Astronomy', 'Cosmic Microwave Background', 'Relic radiation from the hot early universe, now cooled to about 2.7 K.', ['cosmology'], ['Dark Matter', 'Big Bang']],
  ['Astronomy', 'Big Bang', 'The prevailing model of the universe expanding from an extremely hot, dense early state.', ['cosmology'], ['Cosmic Microwave Background', 'Nucleosynthesis', 'Entropy']],
  // Physics
  ['Physics', 'General Relativity', 'Einstein’s theory describing gravity as the curvature of spacetime by mass and energy.', ['physics', 'relativity'], ['Special Relativity', 'Black Holes', 'Gravitational Lensing', 'Differential Geometry']],
  ['Physics', 'Special Relativity', 'The physics of motion at high speeds: time dilation, length contraction and E = mc².', ['physics', 'relativity'], ['General Relativity', 'Doppler Beaming']],
  ['Physics', 'Angular Momentum', 'The rotational analogue of linear momentum; conserved in isolated systems.', ['physics'], ['Accretion Disks', 'Classical Mechanics']],
  ['Physics', 'Classical Mechanics', 'Newtonian description of motion, forces and energy for everyday scales.', ['physics'], ['Angular Momentum', 'Calculus']],
  ['Physics', 'Entropy', 'A measure of the number of microscopic arrangements consistent with a macroscopic state.', ['physics', 'information'], ['Information Theory', 'Hawking Radiation', 'Thermodynamics']],
  ['Physics', 'Thermodynamics', 'The study of heat, work and energy, and the laws that constrain them.', ['physics'], ['Entropy', 'Classical Mechanics']],
  ['Physics', 'Quantum Field Theory', 'The framework combining quantum mechanics and special relativity; particles are excitations of fields.', ['physics', 'quantum'], ['Special Relativity', 'Hawking Radiation', 'Linear Algebra']],
  // Computer Science
  ['Computer Science', 'Graph Theory', 'The mathematics of nodes and edges — the backbone of networks, maps and knowledge graphs.', ['cs', 'math'], ['Force-Directed Layout', 'Community Detection', 'PageRank', 'Linear Algebra']],
  ['Computer Science', 'Force-Directed Layout', 'Drawing graphs by simulating attractive springs and repulsive charges until the system settles.', ['cs', 'visualization'], ['Graph Theory', 'Barnes–Hut Simulation', 'Information Design']],
  ['Computer Science', 'Barnes–Hut Simulation', 'An O(n log n) approximation for n-body forces using a spatial tree of aggregated masses.', ['cs', 'algorithms'], ['Force-Directed Layout', 'Octrees', 'Classical Mechanics']],
  ['Computer Science', 'Octrees', 'Trees that recursively subdivide 3D space into eight octants for fast spatial queries.', ['cs', 'data-structures'], ['Barnes–Hut Simulation', 'Ray Marching']],
  ['Computer Science', 'Community Detection', 'Finding densely connected groups in networks, e.g. with label propagation or modularity.', ['cs', 'algorithms'], ['Graph Theory', 'PageRank']],
  ['Computer Science', 'PageRank', 'Ranking nodes by the stationary distribution of a random walk over links.', ['cs', 'algorithms'], ['Graph Theory', 'Markov Chains', 'Linear Algebra']],
  ['Computer Science', 'Ray Marching', 'Rendering by stepping along rays through a field — ideal for volumes, fractals and bent light.', ['cs', 'graphics'], ['GPU Shaders', 'Gravitational Lensing', 'Octrees']],
  ['Computer Science', 'GPU Shaders', 'Small programs running massively in parallel on the graphics processor.', ['cs', 'graphics'], ['Ray Marching', 'Procedural Noise', 'Linear Algebra']],
  ['Computer Science', 'Procedural Noise', 'Coherent pseudo-random functions (Perlin, simplex) used to synthesise natural textures.', ['cs', 'graphics'], ['GPU Shaders', 'Fractals']],
  ['Computer Science', 'Information Theory', 'Shannon’s mathematics of communication: entropy, channels and compression.', ['cs', 'information'], ['Entropy', 'Compression', 'Probability']],
  ['Computer Science', 'Compression', 'Representing information with fewer bits by exploiting redundancy.', ['cs'], ['Information Theory']],
  ['Computer Science', 'Hash Functions', 'Functions mapping data to fixed-size values; the basis of hash tables and integrity checks.', ['cs', 'security'], ['Public-Key Cryptography', 'Data Structures']],
  ['Computer Science', 'Data Structures', 'Ways of organising data for efficient access: arrays, trees, heaps, hash tables.', ['cs'], ['Hash Functions', 'Octrees', 'Graph Theory']],
  ['Computer Science', 'Public-Key Cryptography', 'Encryption with paired keys — one public, one private — enabling secure communication.', ['cs', 'security'], ['Prime Numbers', 'Hash Functions']],
  ['Computer Science', 'Local-First Software', 'Software that keeps data on the user’s device, works offline and treats the cloud as optional.', ['cs', 'privacy'], ['Personal Knowledge Management', 'Data Structures']],
  // Mathematics
  ['Mathematics', 'Linear Algebra', 'Vectors, matrices and linear maps — the language of graphics, physics and machine learning.', ['math'], ['Eigenvectors', 'GPU Shaders', 'Graph Theory']],
  ['Mathematics', 'Eigenvectors', 'Directions a linear map only stretches; central to PageRank and vibration analysis.', ['math'], ['Linear Algebra', 'PageRank']],
  ['Mathematics', 'Calculus', 'The mathematics of change and accumulation: derivatives and integrals.', ['math'], ['Differential Geometry', 'Classical Mechanics']],
  ['Mathematics', 'Differential Geometry', 'Geometry of curved spaces using calculus — the mathematical stage of general relativity.', ['math'], ['Calculus', 'General Relativity', 'Topology']],
  ['Mathematics', 'Topology', 'The study of properties preserved under continuous deformation.', ['math'], ['Differential Geometry', 'Graph Theory']],
  ['Mathematics', 'Probability', 'Quantifying uncertainty with measures over possible outcomes.', ['math'], ['Markov Chains', 'Information Theory', 'Bayesian Reasoning']],
  ['Mathematics', 'Markov Chains', 'Random processes where the next state depends only on the current one.', ['math'], ['Probability', 'PageRank']],
  ['Mathematics', 'Prime Numbers', 'Integers greater than one divisible only by one and themselves.', ['math'], ['Public-Key Cryptography', 'Number Theory']],
  ['Mathematics', 'Number Theory', 'The study of integers and their properties.', ['math'], ['Prime Numbers']],
  ['Mathematics', 'Fractals', 'Self-similar structures with fractional dimension, from coastlines to the Mandelbrot set.', ['math', 'graphics'], ['Procedural Noise', 'Topology']],
  // Philosophy
  ['Philosophy', 'Epistemology', 'The theory of knowledge: what we can know, and how we justify belief.', ['philosophy'], ['Bayesian Reasoning', 'Philosophy of Science', 'Personal Knowledge Management']],
  ['Philosophy', 'Bayesian Reasoning', 'Updating beliefs in proportion to evidence using Bayes’ theorem.', ['philosophy', 'math'], ['Probability', 'Epistemology']],
  ['Philosophy', 'Philosophy of Science', 'How science works: falsifiability, paradigms and explanation.', ['philosophy'], ['Epistemology', 'General Relativity', 'Emergence']],
  ['Philosophy', 'Emergence', 'Complex patterns arising from simple interactions — flocks, minds, cities.', ['philosophy', 'systems'], ['Systems Thinking', 'Community Detection']],
  ['Philosophy', 'Systems Thinking', 'Understanding wholes through feedback loops, stocks and flows.', ['systems'], ['Emergence', 'Thermodynamics']],
  ['Philosophy', 'Stoicism', 'A philosophy of virtue and attention to what is within one’s control.', ['philosophy'], ['Attention']],
  ['Philosophy', 'Attention', 'The scarce faculty that decides what we perceive, learn and remember.', ['philosophy', 'learning'], ['Stoicism', 'Spaced Repetition', 'Deep Work']],
  // Learning
  ['Learning', 'Personal Knowledge Management', 'Practices for capturing, connecting and resurfacing what you learn.', ['learning', 'pkm'], ['Zettelkasten', 'Evergreen Notes', 'Local-First Software', 'Epistemology']],
  ['Learning', 'Zettelkasten', 'A note-taking method of atomic, densely linked notes that grow into a web of ideas.', ['learning', 'pkm'], ['Evergreen Notes', 'Personal Knowledge Management', 'Graph Theory']],
  ['Learning', 'Evergreen Notes', 'Notes written to evolve and accumulate over time, rather than to capture once.', ['learning', 'pkm'], ['Zettelkasten', 'Spaced Repetition']],
  ['Learning', 'Spaced Repetition', 'Reviewing material at increasing intervals to move it into long-term memory.', ['learning'], ['Attention', 'Evergreen Notes', 'Forgetting Curve']],
  ['Learning', 'Forgetting Curve', 'Ebbinghaus’ observation that memory decays roughly exponentially without review.', ['learning'], ['Spaced Repetition']],
  ['Learning', 'Deep Work', 'Sustained, distraction-free concentration on cognitively demanding tasks.', ['learning'], ['Attention']],
  ['Learning', 'Feynman Technique', 'Learning by explaining an idea in simple terms and filling the gaps you discover.', ['learning'], ['Evergreen Notes', 'Epistemology']],
  // Design
  ['Design', 'Information Design', 'Shaping data so that its structure becomes immediately legible.', ['design', 'visualization'], ['Visual Hierarchy', 'Force-Directed Layout', 'Data-Ink Ratio']],
  ['Design', 'Visual Hierarchy', 'Ordering elements by importance using size, contrast and position.', ['design'], ['Information Design', 'Typography', 'Negative Space']],
  ['Design', 'Typography', 'The craft of arranging type to make language readable and expressive.', ['design'], ['Visual Hierarchy', 'Negative Space']],
  ['Design', 'Negative Space', 'The empty areas that give a composition room to breathe and focus.', ['design'], ['Visual Hierarchy', 'Typography']],
  ['Design', 'Data-Ink Ratio', 'Tufte’s principle: maximise the share of ink devoted to data.', ['design', 'visualization'], ['Information Design']],
  ['Design', 'Motion Design', 'Using timing and easing to explain change and guide attention.', ['design'], ['Easing Functions', 'Visual Hierarchy']],
  ['Design', 'Easing Functions', 'Curves that map time to progress, giving motion weight and character.', ['design', 'math'], ['Motion Design', 'Calculus']],
  ['Design', 'Color Theory', 'How hue, value and saturation interact — and why restraint reads as premium.', ['design'], ['Visual Hierarchy']]
]

const SECTIONS = {
  Astronomy: ['Observations', 'Open questions'],
  Physics: ['Key ideas', 'Where it shows up'],
  'Computer Science': ['How it works', 'Trade-offs'],
  Mathematics: ['Core definitions', 'Connections'],
  Philosophy: ['Central claims', 'Critiques'],
  Learning: ['Practice', 'Pitfalls'],
  Design: ['Principles', 'Examples']
}

const titles = new Set(T.map((t) => t[1]))
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })

const now = Date.now()
T.forEach(([folder, title, summary, tags, links], i) => {
  const valid = links.filter((l) => titles.has(l))
  const [s1, s2] = SECTIONS[folder]
  const related = valid.map((l) => `- [[${l}]]`).join('\n')
  const inline = valid.length ? `It connects closely to [[${valid[0]}]]${valid[1] ? ` and [[${valid[1]}]]` : ''}.` : ''
  const body = `---
tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]
description: ${JSON.stringify(summary)}
demo: true
---
# ${title}

${summary} ${inline}

## ${s1}
- ${title} is part of the *${folder}* constellation in this sample vault.
- Each bullet here is placeholder study material written for the NEXUS demo.

## ${s2}
> [!note] Sample note
> This note ships with NEXUS as demonstration data. Connect your own Obsidian vault to see your real notes.

## Related
${related || '- (no links yet)'}
`
  const file = join(root, folder, `${title}.md`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body)
  // Spread modification times over the past months so the dashboard has a history.
  const age = ((i * 7919) % 160) * 86400000 * 0.9 + (i % 5) * 3600000
  const t = new Date(now - age)
  utimesSync(file, t, t)
})

writeFileSync(
  join(root, 'Welcome to the Demo.md'),
  `---
tags: [demo]
description: "Start here: this universe is sample data bundled with NEXUS."
---
# Welcome to the Demo

This is a **demonstration universe** made of sample notes bundled with NEXUS. None of it is your data.

- Explore constellations like [[Black Holes]], [[Graph Theory]] and [[Zettelkasten]].
- Press ⌘K to search, click a star to read it, and press Esc to step back.

When you are ready, choose **Settings → Connect vault…** to visualise your own Obsidian vault.
`
)
console.log(`Demo vault written: ${T.length + 1} notes → ${root}`)
