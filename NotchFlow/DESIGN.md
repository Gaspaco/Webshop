# Design System

## Direction

NotchFlow is a compact piece of black hardware that appears to extend from the MacBook notch. Its personality comes from precise geometry, responsive movement, and one cool mint status color rather than decorative effects.

## Color

- Island: `#050706`
- Raised surface: `#111512`
- Primary text: `#F5F7F5`
- Secondary text: `#A6ADA8`
- Hairline: `#292F2B`
- Active mint: `#55E6A5`
- Warning amber: `#FFCA67`

## Typography

Use the macOS system font. Titles use semibold weight, metadata uses regular weight, and changing numeric values use monospaced digits. Avoid oversized display text.

## Shape

The collapsed island follows the physical notch with a flat top edge and 14-point lower corners. The expanded panel keeps the flat top and uses 22-point lower corners. Buttons are circular only when the symbol is universally understood.

## Motion

Open and close with a short ease-out spring that has low bounce. Content crossfades after the panel begins expanding. Reduced-motion mode uses an immediate resize and opacity change.

## Components

- **Collapsed island:** app activity mark, compact track title, battery percentage.
- **Expanded player:** artwork tile, track and artist, playback controls, timeline.
- **System strip:** battery state and output volume.
- **Menu bar:** open/close, launch at login, settings, quit.

## Layout

Anchor the panel to the top-center of the active display. The expanded panel is wide enough for readable track metadata but remains under 460 points. On notchless displays, leave a small top margin so the island reads as an intentional floating control.
