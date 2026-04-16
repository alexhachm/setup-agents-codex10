# Slide Layout Definitions

Standard slide layouts for presentation generation by mac10 workers.

---

## Layout 1: Title Slide

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│         {PRESENTATION TITLE}            │
│         ─────────────────────           │
│         {Subtitle / Date}               │
│         {Author / Team}                 │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

**Usage**: First slide only. Sets context for the entire presentation.
**Content rules**: Title ≤ 8 words. Subtitle ≤ 15 words.

---

## Layout 2: Section Header

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│         {SECTION TITLE}                 │
│         {Brief description}             │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

**Usage**: Transition between major sections.
**Content rules**: Title ≤ 5 words. Description ≤ 20 words.

---

## Layout 3: Content + Visual

```
┌─────────────────────────────────────────┐
│  {Slide Title}                          │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │             │  │                 │  │
│  │   Bullet    │  │   Image /       │  │
│  │   Points    │  │   Diagram /     │  │
│  │   (left)    │  │   Chart         │  │
│  │             │  │   (right)       │  │
│  └─────────────┘  └─────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

**Usage**: Main content slides with supporting visuals.
**Content rules**: 3-5 bullet points. Each ≤ 15 words. Visual fills right half.

---

## Layout 4: Two-Column

```
┌─────────────────────────────────────────┐
│  {Slide Title}                          │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │             │  │                 │  │
│  │   Column A  │  │   Column B     │  │
│  │   (Before / │  │   (After /     │  │
│  │    Problem)  │  │    Solution)   │  │
│  │             │  │                 │  │
│  └─────────────┘  └─────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

**Usage**: Comparisons, before/after, pros/cons.
**Content rules**: Parallel structure between columns. Equal weight.

---

## Layout 5: Data Table

```
┌─────────────────────────────────────────┐
│  {Slide Title}                          │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Col A  │  Col B  │  Col C     │    │
│  │─────────┼─────────┼────────────│    │
│  │  data   │  data   │  data      │    │
│  │  data   │  data   │  data      │    │
│  │  data   │  data   │  data      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  {Key takeaway in one sentence}         │
└─────────────────────────────────────────┘
```

**Usage**: Metrics, status updates, structured data.
**Content rules**: ≤ 5 rows, ≤ 5 columns. Highlight key values. Always include a takeaway.

---

## Layout 6: Summary / Call to Action

```
┌─────────────────────────────────────────┐
│  {Summary Title}                        │
│                                         │
│  Key Takeaways:                         │
│  1. {First insight}                     │
│  2. {Second insight}                    │
│  3. {Third insight}                     │
│                                         │
│  Next Steps:                            │
│  → {Action item 1}                      │
│  → {Action item 2}                      │
│                                         │
│  {Contact / follow-up info}             │
└─────────────────────────────────────────┘
```

**Usage**: Final slide. Summarize and drive action.
**Content rules**: ≤ 3 takeaways. ≤ 3 next steps. Each ≤ 15 words.

---

## Style Guidelines

- **Font**: Sans-serif (system default or specified in task)
- **Colors**: Use project brand colors if available; otherwise neutral palette
- **Text size**: Titles 28-36pt, body 18-24pt, captions 14-16pt
- **Alignment**: Left-aligned text, centered titles
- **Spacing**: Generous whitespace; never fill every pixel
- **Charts**: Label axes, include units, highlight the key data point
