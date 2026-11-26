import { Grid } from 'antd'

// Tables wrap their text to fit on phones, where the less important columns are hidden (each
// column's `responsive` setting). Wider screens keep every column and scroll sideways if needed.
export function useTableScroll() {
  const screens = Grid.useBreakpoint()
  return screens.sm === false ? undefined : { x: 'max-content' }
}
