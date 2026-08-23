import axios from "axios";
import { HTTP_BACKEND } from "@/config";

export interface Me {
  userId: string;
  name: string;
}

export async function getMe(): Promise<Me | null> {
  try {
    const res = await axios.get(`${HTTP_BACKEND}/auth/me`, { withCredentials: true });
    return res.data as Me;
  } catch {
    return null;
  }
}

export async function checkAuth(): Promise<boolean> {
  return (await getMe()) !== null;
}
