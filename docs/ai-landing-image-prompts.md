# OnyaHealth Landing Image Prompts

Use these prompts in your image generator (ChatGPT Images, Midjourney, or Firefly) to create page-specific hero images that feel similar to premium telehealth brands.

## Generate directly from this repo (OpenAI API)

If `OPENAI_API_KEY` is set in `.env`, you can generate the 3 landing images with:

```bash
npm run images:landing
```

Dry run:

```bash
npm run images:landing:dry
```

## Global prompt settings
- Style: hyper-realistic photography
- Aspect ratio: 3:2 landscape
- Suggested export size: 1800 x 1200
- Tone: clean, calm, professional, modern Australian telehealth
- Lighting: natural soft daylight, no harsh shadows
- Colour grade: cool-neutral clinical (blue + soft white)
- Composition: clear subject on right or center-right, negative space on left for potential text overlay
- Avoid: cartoon style, overly staged stock-photo smiles, visible logos, fake medical claims text, watermark, distorted hands

## 1) Work Medical Certificate page
Prompt:
Hyper-realistic photo of an Australian adult at home on a laptop completing an online medical certificate request while mildly unwell (blanket, tea mug nearby), clean modern interior, mobile phone and laptop visible, subtle healthcare context without hospital equipment, trustworthy and calm mood, telehealth startup style, high detail skin texture and realistic lighting, depth of field, composition with usable empty space on left.

Negative prompt:
No hospital bed, no dramatic emergency scene, no branding, no text overlays, no surreal artifacts.

Recommended filename:
- `landing-work-certificate.png`

## 2) University Medical Certificate page
Prompt:
Hyper-realistic photo of a university student in Australia at a study desk using laptop and phone to request a medical certificate online, notebooks and assessment papers on desk, mild fatigue expression, tidy student apartment setting, clean natural window light, modern telehealth visual style, realistic skin, hands, and screen reflections, professional and credible healthcare brand mood, room for text on left side.

Negative prompt:
No graduation cap props, no classroom crowd, no logos, no fake certificates visible, no exaggerated distress.

Recommended filename:
- `landing-university-certificate.png`

## 3) Carer's Leave Certificate page
Prompt:
Hyper-realistic photo of an Australian carer at home supporting an older family member in the background while completing a telehealth leave request on a smartphone, compassionate calm moment, modern home interior, subtle healthcare realism, warm human connection with professional tone, no clinical drama, high detail realistic photography, clean composition with left-side negative space.

Negative prompt:
No hospital ward scene, no emergency equipment, no branded uniforms, no visible logos or watermarks.

Recommended filename:
- `landing-carers-certificate.png`

## Drop-in paths for this project
Place exported images in:
- `frontend/public/landing-work-certificate.png`
- `frontend/public/landing-university-certificate.png`
- `frontend/public/landing-carers-certificate.png`

Then update `frontend/src/pages/CertificateCampaignPage.tsx`:
- `heroImageSrc` for each config object.
