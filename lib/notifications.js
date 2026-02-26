"use server";
 
import webpush from 'web-push';
import supabase from '@/lib/usersdb';
import crypto from 'crypto';
 
webpush.setVapidDetails(
	'mailto:gaiasenses.cti@gmail.com',
	process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
	process.env.VAPID_PRIVATE_KEY
);
  
export async function isValidEmail(email) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function subscribeUser(user) {
  //teste abaixo, remover depois
  console.log('SUBSCRIBE PAYLOAD:', user);
  if (!user.name || !user.email || !user.freq || !user.first_push || !user.sub) {
    throw new Error('Missing informations');
  }

  if (!isValidEmail(user.email)) {
    throw new Error('Invalid email');
  }

  const user_id = crypto.randomUUID();

  const { error } = await supabase
    .from('GaiaSubs')
    .insert({
      user_id,
      name: user.name,
      email: user.email,
      frequency: user.freq,
      next_push: user.first_push,
      subscription: user.sub
    });

  if (error) {
    throw new Error('Error while subscribing user');
  }

  return { success: true, user_id };
}
 
export async function unsubscribeUser(sub) {
  const { error, data } = await supabase
    .from('GaiaSubs')
    .delete()
    .eq('subscription->>endpoint', sub.endpoint);

  if (error || !data?.length) {
    return { success: false };
  }

  return { success: true };
}

export async function sendNotification() {
  const today = new Date();
  const start = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  ));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const { data: users, error } = await supabase
    .from('GaiaSubs')
    .select('*')
    .gte('next_push', start.toISOString())
    .lt('next_push', end.toISOString());

  if (error) {
    throw new Error('Error fetching users');
  }

  const payload = JSON.stringify({
    title: 'GaiaSenses',
    body: 'Clique e veja o clima na sua região!',
    icon: '/icon.png'
  });

  for (const user of users) {
    try {
      await webpush.sendNotification(user.subscription, payload);

      let next = new Date(user.next_push);
//http://localhost:3000/api/notifications
      switch (user.frequency) {
        /*
        case 'Notification.notification60secTest':
          next.setUTCMinutes(next.getUTCMinutes() + 1);
          break;
        */
        case 'Diária':
          next.setUTCDate(next.getUTCDate() + 1);
          break;
        case 'Semanal':
          next.setUTCDate(next.getUTCDate() + 7);
          break;
        case 'Mensal':
          next.setUTCMonth(next.getUTCMonth() + 1);
          break;
      }

      await supabase
        .from('GaiaSubs')
        .update({ next_push: next.toISOString() })
        .eq('user_id', user.user_id);

    } catch (err) {
      console.error('Push error:', err);
    }
  }

  return { success: true };
}