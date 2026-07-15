import type { PackageJsonInput } from '@/types'

export function mergePackageJsonDependencies(
  packageJson: PackageJsonInput,
  includeDevDependencies: boolean,
): Record<string, string> {
  return {
    ...packageJson.dependencies,
    ...(includeDevDependencies ? packageJson.devDependencies : {}),
  }
}
