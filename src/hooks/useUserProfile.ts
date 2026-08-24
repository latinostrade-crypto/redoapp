import { useState, useEffect, useCallback } from 'react';
import { PlayerProfile } from '../types';
import { apiRequest } from '../utils/api';

export function useUserProfile() {
  const [profile, setProfile] = useState<Partial<PlayerProfile> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiRequest<{ profile?: Partial<PlayerProfile> }>('/api/users/sync', {
        method: 'POST',
      });
      if (res.profile) {
        setProfile(res.profile);
      }
    } catch (err) {
      console.error('Failed to fetch profile', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, fetchProfile, loading };
}
