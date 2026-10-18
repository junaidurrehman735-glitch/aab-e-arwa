export interface AssignedDriver {
  driver_id: string;
  driver_name: string;
  vehicle: string;
}

/**
 * Automatically assigns an active delivery driver and vehicle based on delivery area.
 * Uses the existing four delivery areas / drivers distribution:
 * - Chiltan Scheme Airport Road -> kakar1 (Van #1)
 * - Nawa Killi Bypass -> delevery boy (Van #2)
 * - Main Jinnah Road -> kakar1 (Van #1)
 * - Quetta Avenue City -> delevery boy (Van #2)
 */
export function getAssignedDriverForArea(
  area: string = '',
  users: Array<{ id: string; name: string; role_id?: string; role_name?: string; area?: string; status?: string }>
): AssignedDriver {
  const drivers = (users || []).filter(
    (u) =>
      (u.role_id === 'role-delivery' || u.role_name === 'Delivery Boy') &&
      u.status !== 'inactive'
  );

  if (drivers.length === 0) {
    return {
      driver_id: '89198262-90b1-4e0d-adcc-63091463ba52',
      driver_name: 'kakar1',
      vehicle: 'Van #1',
    };
  }

  const normArea = (area || '').trim().toLowerCase();

  // 1. Direct match if a driver has an explicitly assigned area in their profile
  const exactMatch = drivers.find((d) => d.area && d.area.toLowerCase() === normArea);
  if (exactMatch) {
    return {
      driver_id: exactMatch.id,
      driver_name: exactMatch.name,
      vehicle: (exactMatch as any).vehicle || 'Van #1',
    };
  }

  // 2. Existing four delivery areas assignment logic:
  if (normArea.includes('nawa killi') || normArea.includes('quetta avenue')) {
    const d = drivers[1] || drivers[0];
    return {
      driver_id: d.id,
      driver_name: d.name,
      vehicle: 'Van #2',
    };
  } else {
    const d = drivers[0];
    return {
      driver_id: d.id,
      driver_name: d.name,
      vehicle: 'Van #1',
    };
  }
}
