---
name: post-prompt-writing
description: How to write the raw prompt file that the generate-posts post-with-image pipeline expects, including how to steer the image style (serious illustration vs funny).
---

# Writing the raw prompt for generate-posts

The pipeline improves your prompt, writes the post (with a `fetch_url` tool for
links), humanizes it, then picks an image style **from the raw prompt text** and
builds the image from the finished post. So the prompt must state the topic,
the angle and the image wish clearly, in plain language.

## Prompt shapes that work (from real queued prompts)

- From an article: `generate a helpful post on this article <url>`
- Practical takeaways: `extract the practical ideas from this post: <url> and create a post that ...`
- From pasted text: `generate a funny image for a post about:` followed by the text.
- From a topic: `Write a post on <topic> for <audience>, highlighting <angle>.`

## What to include

1. **Topic or source**: the URL or the pasted text. Keep pasted text intact.
2. **Angle**: the single point to emphasise (cost, risk, how-to, myth vs fact).
3. **Audience / tone**: e.g. engineers, executives; practical, hopeful, sceptical.
4. **Image style** (the pipeline reads this):
   - Default: say nothing, or "an illustration" -> serious editorial illustration.
   - Humor: say "a funny image" -> funny cartoon-style image.
   - Both: only if the user asked for two images, say so explicitly
     ("a serious cover image and a separate funny one").
   - Never make the funny style the default for serious topics (layoffs, harm).
5. **Language** if not English.

## Keep it short

3-8 lines. Do not write the post, outline it, or describe the image in detail:
the pipeline does that from the finished post. Do not add instructions about
publishing, S3 or APIs.

## Naming

Name = 2-6 lowercase words describing the topic, e.g. `index-md-hub-pattern`.
