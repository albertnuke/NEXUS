import { describe, expect, it } from 'vitest'
import { parseNote, parseWikiTarget, parseMarkdownHref, normalizeTag, splitFrontmatter } from '../../src/main/indexing/parser'

describe('wikilink parsing', () => {
  it('parses all Obsidian wikilink forms', () => {
    expect(parseWikiTarget('Network Security')).toEqual({ target: 'Network Security', anchor: undefined, display: undefined })
    expect(parseWikiTarget('Network Security|Security')).toEqual({ target: 'Network Security', anchor: undefined, display: 'Security' })
    expect(parseWikiTarget('Cybersecurity/Network Security')).toMatchObject({ target: 'Cybersecurity/Network Security' })
    expect(parseWikiTarget('Network Security#Firewalls')).toEqual({ target: 'Network Security', anchor: 'Firewalls', display: undefined })
    expect(parseWikiTarget('Note#^block-id|Shown')).toEqual({ target: 'Note', anchor: '^block-id', display: 'Shown' })
    expect(parseWikiTarget('Python Basics\\|Py')).toMatchObject({ target: 'Python Basics', display: 'Py' })
  })

  it('extracts wikilinks, embeds and markdown links but ignores code and comments', () => {
    const parsed = parseNote(
      [
        '# Title',
        'See [[A]], [[B|bee]], ![[C]] and [md](Folder/D.md#Section).',
        '```',
        '[[InFence]]',
        '```',
        'Inline `[[InCode]]` %% [[InComment]] %%',
        '',
        '    [[IndentedCode]]',
        '',
        '<div>[[InHtmlBlock]]</div>',
        '',
        'External [site](https://example.com) and <https://obsidian.md>.'
      ].join('\n')
    )
    const targets = parsed.links.map((l) => `${l.kind}:${l.target}`)
    expect(targets).toEqual(['wiki:A', 'wiki:B', 'embed:C', 'markdown:Folder/D.md'])
    expect(parsed.links[3].anchor).toBe('Section')
    expect(parsed.externalLinks.map((l) => l.url)).toEqual(['https://example.com', 'https://obsidian.md'])
  })

  it('extracts headings, tags, aliases and dates from frontmatter and body', () => {
    const parsed = parseNote(
      [
        '---',
        'title: Custom Title',
        'tags: [alpha, "beta/gamma"]',
        'aliases: [First Alias, Second]',
        'due: 2099-01-02',
        'created: 2020-05-06',
        'description: A described note.',
        '---',
        '# Heading One',
        '## Heading [[Linked]] Two',
        'Body with #inline/tag and #123 (numeric, not a tag) and a#notatag.',
        '# not-a-tag-heading'
      ].join('\n')
    )
    expect(parsed.title).toBe('Custom Title')
    expect(parsed.headings).toEqual([
      { level: 1, text: 'Heading One' },
      { level: 2, text: 'Heading Linked Two' },
      { level: 1, text: 'not-a-tag-heading' }
    ])
    expect(parsed.tags.sort()).toEqual(['alpha', 'beta/gamma', 'inline/tag'])
    expect(parsed.aliases).toEqual(['First Alias', 'Second'])
    expect(parsed.description).toBe('A described note.')
    expect(parsed.dates.map((d) => d.key)).toEqual(['due'])
    expect(parsed.createdFromFrontmatter).toBe(Date.parse('2020-05-06T00:00:00'))
  })

  it('never executes JavaScript front matter', () => {
    ;(globalThis as Record<string, unknown>).__pwned = false
    const res = splitFrontmatter('---js\n{ x: (globalThis.__pwned = true) }\n---\nbody')
    expect((globalThis as Record<string, unknown>).__pwned).toBe(false)
    expect(res.data).toEqual({})
  })

  it('survives invalid YAML frontmatter', () => {
    const parsed = parseNote('---\ntags: [unclosed\n---\n# Still Parsed\n[[Link]]')
    expect(parsed.frontmatterError).toMatch(/Invalid frontmatter/)
    expect(parsed.links.map((l) => l.target)).toEqual(['Link'])
  })

  it('normalizes tags and markdown hrefs', () => {
    expect(normalizeTag('#Project/Alpha')).toBe('Project/Alpha')
    expect(normalizeTag('2024')).toBeNull()
    expect(parseMarkdownHref('Python%20Basics.md')).toEqual({ target: 'Python Basics.md', anchor: undefined })
    expect(parseMarkdownHref('#local')).toBeNull()
    expect(parseMarkdownHref('https://x.y')).toBeNull()
  })
})
