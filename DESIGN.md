---
name: Vibrant Utility
colors:
  surface: '#fbf8ff'
  surface-dim: '#dad9e3'
  surface-bright: '#fbf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2fd'
  surface-container: '#eeedf7'
  surface-container-high: '#e8e7f1'
  surface-container-highest: '#e3e1ec'
  on-surface: '#1a1b22'
  on-surface-variant: '#584237'
  inverse-surface: '#2f3038'
  inverse-on-surface: '#f1effa'
  outline: '#8c7164'
  outline-variant: '#e0c0b1'
  surface-tint: '#9d4300'
  primary: '#9d4300'
  on-primary: '#ffffff'
  primary-container: '#f97316'
  on-primary-container: '#582200'
  inverse-primary: '#ffb690'
  secondary: '#795900'
  on-secondary: '#ffffff'
  secondary-container: '#ffc329'
  on-secondary-container: '#6f5100'
  tertiary: '#006591'
  on-tertiary: '#ffffff'
  tertiary-container: '#09a4e8'
  on-tertiary-container: '#003650'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbca'
  primary-fixed-dim: '#ffb690'
  on-primary-fixed: '#341100'
  on-primary-fixed-variant: '#783200'
  secondary-fixed: '#ffdf9f'
  secondary-fixed-dim: '#f9bd22'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#5c4300'
  tertiary-fixed: '#c9e6ff'
  tertiary-fixed-dim: '#89ceff'
  on-tertiary-fixed: '#001e2f'
  on-tertiary-fixed-variant: '#004c6e'
  background: '#fbf8ff'
  on-background: '#1a1b22'
  surface-variant: '#e3e1ec'
typography:
  display:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  max-width: 1280px
---

## Brand & Style
The design system is built for high-velocity productivity and technical clarity. It targets developers and digital creators who require a workspace that feels both professional and high-energy. The aesthetic is **Modern/SaaS**, characterized by precision, ample whitespace, and a striking use of vibrant accents to highlight key actions and status changes.

The emotional response should be one of "controlled energy"—where the UI feels fast, responsive, and optimistic. It avoids the coldness of traditional enterprise software by using warm primary tones while maintaining a rigorous systematic layout that ensures reliability.

## Colors
The palette is anchored by a **Vibrant Orange** primary color, designed to draw attention to primary calls-to-action and active states. A **Warm Amber** serves as a secondary accent, providing a harmonious transition for warnings or secondary highlights. 

To maintain professional balance, the neutral palette utilizes a sophisticated "Zinc" scale of grays. Backgrounds use a very light off-white (#fafafa) to reduce eye strain, while deep charcoals are reserved for high-contrast typography. Success and Error states follow standard conventions but are adjusted in saturation to match the intensity of the orange primary.

## Typography
The design system utilizes **Geist** for its core typeface, providing a clean, technical, and highly legible experience across all interfaces. The tracking is slightly tightened for headlines to give a more "designed" and urgent feel. 

For technical data, code snippets, and metadata labels, **JetBrains Mono** is employed to signal a "toolbox" environment. This monospaced secondary font provides a clear visual distinction between narrative content and functional data. Scale is managed through a strict hierarchy that prioritizes readability on high-density screens.

## Layout & Spacing
The layout follows a **fluid grid system** with a 12-column structure for desktop and a 4-column structure for mobile. Spacing is governed by an 8px base unit, ensuring all components align to a predictable rhythm. 

- **Desktop:** 12 columns with 24px gutters, max-width of 1280px for central content areas.
- **Tablet:** 8 columns with 20px gutters.
- **Mobile:** 4 columns with 16px gutters and 16px side margins.

Horizontal spacing between interactive elements (like buttons in a group) should always use the `md` (16px) increment, while internal padding for containers uses `lg` (24px) to create a sense of openness.

## Elevation & Depth
The design system uses **Tonal Layers** combined with **Ambient Shadows** to communicate hierarchy. Surfaces are categorized into three levels:
1.  **Base (Level 0):** The primary background color, used for the main canvas.
2.  **Surface (Level 1):** Subtle white cards or containers that sit on the base, featuring a very soft 4px blur shadow with 5% opacity.
3.  **Overlay (Level 2):** Modals, dropdowns, and tooltips. These use a more pronounced 12px blur shadow with a slight orange-tinted neutral shadow (#27272a15) to maintain the brand's warmth even in shadows.

Depth is also suggested through "ghost borders"—1px solid lines using a low-opacity neutral (#e4e4e7) to define structure without adding visual noise.

## Shapes
A **Rounded** corner strategy is applied throughout the design system. This choice balances the technical nature of the typography with a friendly, approachable UI. 

- **Components:** Buttons, inputs, and small widgets use a 0.5rem (8px) radius.
- **Containers:** Large cards and sections use a 1rem (16px) radius.
- **Pills:** Status indicators and tags use a fully rounded (pill) shape to distinguish them from interactive buttons.

## Components
### Buttons
Primary buttons are solid Vibrant Orange with white text. Secondary buttons use a ghost style with an orange border and text. Hover states should involve a subtle shift toward the Warm Amber palette to signify interactivity.

### Input Fields
Inputs use a white background with a 1px Zinc-300 border. Upon focus, the border transitions to Vibrant Orange with a subtle 2px outer glow (ring) of the same color at 20% opacity.

### Cards
Cards are the primary container for information. They feature a 1px border and a Level 1 shadow. On hover, cards may "lift" by increasing the shadow blur to Level 2.

### Chips & Tags
Chips use a low-saturation version of the primary color (Orange-100) with deep Orange-800 text to ensure high legibility and an energetic feel without overwhelming the user.

### Lists
List items use a subtle hover state (#f4f4f5) and utilize JetBrains Mono for secondary metadata, ensuring a clean, data-rich presentation suitable for a technical toolbox.