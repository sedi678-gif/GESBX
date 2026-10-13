import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { ensureFirebaseAuth } from './firebaseAuth';

export type ContactStatus = 'pending' | 'accepted' | 'declined';

export interface MessageContact {
  id: string;
  ownerId: string;
  contactId: string;
  contactName?: string;
  contactAvatar?: string;
  contactHandle?: string;
  status: ContactStatus;
  lastPreview?: string;
  createdAt: number;
}

function contactDocId(ownerId: string, contactId: string) {
  return `${ownerId}__${contactId}`;
}

export async function registerMessageContact(payload: {
  ownerId: string;
  contactId: string;
  initiatedBy: string;
  contactName?: string;
  contactAvatar?: string;
  contactHandle?: string;
  lastPreview?: string;
}): Promise<void> {
  await ensureFirebaseAuth();
  const now = Date.now();

  await setDoc(
    doc(db, 'message_contacts', contactDocId(payload.initiatedBy, payload.ownerId)),
    {
      ownerId: payload.initiatedBy,
      contactId: payload.ownerId,
      status: 'accepted',
      createdAt: now,
    },
    { merge: true }
  );

  if (payload.initiatedBy === payload.ownerId) return;

  const recipientRef = doc(db, 'message_contacts', contactDocId(payload.ownerId, payload.contactId));
  const existing = await getDoc(recipientRef);
  const existingStatus = existing.data()?.status as ContactStatus | undefined;

  const recipientPatch: Record<string, unknown> = {
    ownerId: payload.ownerId,
    contactId: payload.contactId,
    contactName: payload.contactName || '',
    contactAvatar: payload.contactAvatar || '',
    contactHandle: payload.contactHandle || '',
    lastPreview: payload.lastPreview || '',
  };

  if (!existing.exists()) {
    recipientPatch.status = 'pending';
    recipientPatch.createdAt = now;
  } else if (existingStatus !== 'accepted' && existingStatus !== 'declined') {
    recipientPatch.status = 'pending';
  }

  await setDoc(recipientRef, recipientPatch, { merge: true });
}

export async function acceptMessageRequest(ownerId: string, contactId: string): Promise<void> {
  await ensureFirebaseAuth();
  await setDoc(
    doc(db, 'message_contacts', contactDocId(ownerId, contactId)),
    { status: 'accepted', acceptedAt: Date.now() },
    { merge: true }
  );
}

export async function declineMessageRequest(ownerId: string, contactId: string): Promise<void> {
  await ensureFirebaseAuth();
  await setDoc(
    doc(db, 'message_contacts', contactDocId(ownerId, contactId)),
    { status: 'declined', declinedAt: Date.now() },
    { merge: true }
  );
}

export function listenMessageContacts(
  userId: string,
  callback: (contacts: MessageContact[]) => void
): Unsubscribe {
  const q = query(collection(db, 'message_contacts'), where('ownerId', '==', userId));
  return onSnapshot(q, (snap) => {
    const list: MessageContact[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        ownerId: data.ownerId as string,
        contactId: data.contactId as string,
        contactName: data.contactName as string | undefined,
        contactAvatar: data.contactAvatar as string | undefined,
        contactHandle: data.contactHandle as string | undefined,
        status: (data.status as ContactStatus) || 'pending',
        lastPreview: data.lastPreview as string | undefined,
        createdAt: (data.createdAt as number) || 0,
      });
    });
    callback(list);
  });
}

export function isContactAccepted(contacts: MessageContact[], contactId: string): boolean {
  const c = contacts.find((x) => x.contactId === contactId);
  return !c || c.status === 'accepted';
}
