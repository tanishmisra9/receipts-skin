# Product

## What it is
Receipts: a skincare shopping demo built on the YouCam Skin Analysis and Skin Simulation APIs. One selfie is measured once; every product on a shelf then gets a Match, Partial or Skip, with the shopper's own scores and a detection mask as the "receipt".

## Register
Product surface (Operate) for the Try page; Persuade for the landing; Read for How it works.

## Users and situation
- **Hackathon judges** (Perfect Corp product and marketing staff), often scoring from a 2-minute video and screenshots. They need the idea in 10 seconds and a path they can finish without reading.
- **Beauty shoppers** deciding what to buy, on a phone as often as a laptop, wary of products that exist to sell to them.

## Job to be done
Show a shopper, with evidence from their own face, which products they actually need and which they can skip.

## Tone
Plain, honest, a little dry. Confident without hype. No em dashes. Errors say what to do next.

## Principles
1. The product is allowed to say no. Skip is a first-class outcome, shown with the same care as Match.
2. Every claim has a receipt: a number, a mask, a rule.
3. Arithmetic, not an AI opinion, decides verdicts.
4. One page, one job. One primary action per screen.
5. Cosmetic guidance, never medical advice.

## Anti-goals
- No upsell patterns, countdowns, or fake urgency.
- No claims we can't source (return rates, clinical accuracy).
- No real brand names or logos; product names are fictional.
- No decorative motion; motion explains cause and effect.

## Constraints
Static site, no framework or build step; Vercel; one serverless function for live scans. Sample faces work with no key. Accessibility: WCAG AA contrast, keyboard operable, reduced motion respected.
