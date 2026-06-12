import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';

// --- Timeout Helper ---
function withTimeout(promise, ms = 7000, context = 'Database query') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${context} timed out after ${ms/1000}s. This usually means the Firestore Database hasn't been created/enabled in your Firebase Console, or your security rules are blocking the connection.`));
    }, ms);
    
    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}


// --- Channels ---

export async function getChannels(uid) {
  try {
    const channelsRef = collection(db, 'users', uid, 'channels');
    const q = query(channelsRef, orderBy('createdAt', 'desc'));
    const snapshot = await withTimeout(getDocs(q), 7000, 'Loading channels');
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting channels:", error);
    throw error;
  }
}

export async function addChannel(uid, channelName, youtubeUrl, frequency = 'weekly', targetTasks = 3) {
  try {
    const channelsRef = collection(db, 'users', uid, 'channels');
    const docRef = await addDoc(channelsRef, {
      channelName,
      youtubeUrl: youtubeUrl || '',
      frequency,
      targetTasks: Number(targetTasks),
      isBlocked: false,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, channelName, youtubeUrl, frequency, targetTasks, isBlocked: false };
  } catch (error) {
    console.error("Error adding channel:", error);
    throw error;
  }
}

export async function updateChannel(uid, channelId, updates) {
  try {
    const channelRef = doc(db, 'users', uid, 'channels', channelId);
    await updateDoc(channelRef, updates);
  } catch (error) {
    console.error("Error updating channel:", error);
    throw error;
  }
}

export async function deleteChannel(uid, channelId) {
  try {
    // Delete subcollections manually or rely on custom implementation
    // Since Firebase doesn't auto-cascade delete subcollections of a deleted doc via the client SDK, 
    // we should delete them to avoid orphaned data, or delete them in batches.
    const channelRef = doc(db, 'users', uid, 'channels', channelId);
    
    // We will clean up subcollections
    const collectionsToClean = ['videos', 'topics', 'imageResources', 'scriptResources'];
    for (const sub of collectionsToClean) {
      const subRef = collection(db, 'users', uid, 'channels', channelId, sub);
      const snapshot = await withTimeout(getDocs(subRef), 7000, `Clearing ${sub} collection`);
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    
    await deleteDoc(channelRef);
  } catch (error) {
    console.error("Error deleting channel:", error);
    throw error;
  }
}

// --- Videos / Schedule ---

export async function getVideos(uid, channelId) {
  try {
    const videosRef = collection(db, 'users', uid, 'channels', channelId, 'videos');
    const q = query(videosRef, orderBy('scheduledDate', 'asc'));
    const snapshot = await withTimeout(getDocs(q), 7000, 'Loading video schedules');
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error(`Error getting videos for channel ${channelId}:`, error);
    throw error;
  }
}

export async function addVideo(uid, channelId, title, scheduledDate) {
  try {
    const videosRef = collection(db, 'users', uid, 'channels', channelId, 'videos');
    const docRef = await addDoc(videosRef, {
      title,
      scheduledDate, // format: YYYY-MM-DD
      status: 'pending', // 'pending' | 'done' | 'skipped'
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, title, scheduledDate, status: 'pending' };
  } catch (error) {
    console.error("Error adding video:", error);
    throw error;
  }
}

export async function updateVideoStatus(uid, channelId, videoId, status) {
  try {
    const videoRef = doc(db, 'users', uid, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, { status });
  } catch (error) {
    console.error("Error updating video status:", error);
    throw error;
  }
}

export async function deleteVideo(uid, channelId, videoId) {
  try {
    const videoRef = doc(db, 'users', uid, 'channels', channelId, 'videos', videoId);
    await deleteDoc(videoRef);
  } catch (error) {
    console.error("Error deleting video:", error);
    throw error;
  }
}

// --- Topic Bucket ---

export async function getTopics(uid, channelId) {
  try {
    const topicsRef = collection(db, 'users', uid, 'channels', channelId, 'topics');
    const q = query(topicsRef, orderBy('createdAt', 'desc'));
    const snapshot = await withTimeout(getDocs(q), 7000, 'Loading topic bucket');
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting topics:", error);
    throw error;
  }
}

export async function addTopic(uid, channelId, title, notes = '') {
  try {
    const topicsRef = collection(db, 'users', uid, 'channels', channelId, 'topics');
    const docRef = await addDoc(topicsRef, {
      title,
      notes,
      isUsed: false,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, title, notes, isUsed: false };
  } catch (error) {
    console.error("Error adding topic:", error);
    throw error;
  }
}

export async function updateTopic(uid, channelId, topicId, updates) {
  try {
    const topicRef = doc(db, 'users', uid, 'channels', channelId, 'topics', topicId);
    await updateDoc(topicRef, updates);
  } catch (error) {
    console.error("Error updating topic:", error);
    throw error;
  }
}

export async function deleteTopic(uid, channelId, topicId) {
  try {
    const topicRef = doc(db, 'users', uid, 'channels', channelId, 'topics', topicId);
    await deleteDoc(topicRef);
  } catch (error) {
    console.error("Error deleting topic:", error);
    throw error;
  }
}

// --- Image Resources ---

export async function getImageResources(uid, channelId) {
  try {
    const ref = collection(db, 'users', uid, 'channels', channelId, 'imageResources');
    const snapshot = await withTimeout(getDocs(ref), 7000, 'Loading image sources');
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting image resources:", error);
    throw error;
  }
}

export async function addImageResource(uid, channelId, label, url) {
  try {
    const ref = collection(db, 'users', uid, 'channels', channelId, 'imageResources');
    const docRef = await addDoc(ref, {
      label,
      url,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, label, url };
  } catch (error) {
    console.error("Error adding image resource:", error);
    throw error;
  }
}

export async function updateImageResource(uid, channelId, resourceId, updates) {
  try {
    const ref = doc(db, 'users', uid, 'channels', channelId, 'imageResources', resourceId);
    await updateDoc(ref, updates);
  } catch (error) {
    console.error("Error updating image resource:", error);
    throw error;
  }
}

export async function deleteImageResource(uid, channelId, resourceId) {
  try {
    const ref = doc(db, 'users', uid, 'channels', channelId, 'imageResources', resourceId);
    await deleteDoc(ref);
  } catch (error) {
    console.error("Error deleting image resource:", error);
    throw error;
  }
}

// --- Script / Content Resources ---

export async function getScriptResources(uid, channelId) {
  try {
    const ref = collection(db, 'users', uid, 'channels', channelId, 'scriptResources');
    const snapshot = await withTimeout(getDocs(ref), 7000, 'Loading script tools');
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting script resources:", error);
    throw error;
  }
}

export async function addScriptResource(uid, channelId, label, url) {
  try {
    const ref = collection(db, 'users', uid, 'channels', channelId, 'scriptResources');
    const docRef = await addDoc(ref, {
      label,
      url,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, label, url };
  } catch (error) {
    console.error("Error adding script resource:", error);
    throw error;
  }
}

export async function updateScriptResource(uid, channelId, resourceId, updates) {
  try {
    const ref = doc(db, 'users', uid, 'channels', channelId, 'scriptResources', resourceId);
    await updateDoc(ref, updates);
  } catch (error) {
    console.error("Error updating script resource:", error);
    throw error;
  }
}

export async function deleteScriptResource(uid, channelId, resourceId) {
  try {
    const ref = doc(db, 'users', uid, 'channels', channelId, 'scriptResources', resourceId);
    await deleteDoc(ref);
  } catch (error) {
    console.error("Error deleting script resource:", error);
    throw error;
  }
}
