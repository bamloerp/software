export type ProjectPaymentFilterItem = {
  id: string;
  contractValueMinor: bigint;
  totalPaidMinor: bigint;
};

export function filterUnpaidProjects<T extends ProjectPaymentFilterItem>(
  projects: T[],
): T[] {
  return projects.filter((project) => {
    const balance = project.contractValueMinor - project.totalPaidMinor;
    return balance > 0n;
  });
}
