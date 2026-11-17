import { Grid } from 'antd'

// Detail drawers are 736px wide ('large'), wider than a phone. Below md they take the full width.
export function useResponsiveDrawerSize(size = 'large') {
  const screens = Grid.useBreakpoint()
  return screens.md === false ? '100%' : size
}
