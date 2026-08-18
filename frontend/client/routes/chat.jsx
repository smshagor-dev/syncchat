import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Helmet } from 'react-helmet';
import { setModal } from '../redux/features/modal';
import * as cont from '../containers/chat';
import * as modal from '../components/modals';
import FeedbackModal from '../components/modals/feedback';
import ShareContactModal from '../components/modals/shareContact';
import AttachContactModal from '../components/modals/attachContact';
import AttachPollModal from '../components/modals/attachPoll';
import AttachEventModal from '../components/modals/attachEvent';
import AttachStickerModal from '../components/modals/attachSticker';
import CallPanel from '../components/modals/callPanelRuntime';
import CallStart from '../components/modals/callStart';
import CallUiPreview from '../components/mockups/callUiPreview';
import RoomAppearance from '../components/modals/roomAppearance';
import config from '../config';

function Chat() {
  const dispatch = useDispatch();
  const imageCropper = useSelector((state) => state.modal.imageCropper);
  const master = useSelector((state) => state.user.master);
  const showCallUiPreview =
    new URLSearchParams(window.location.search).get('preview') === 'call-ui';
  const seo = config.seo || {};
  const seoTitle = seo.title || config.brandName;
  const seoDescription = seo.description || '';
  const seoKeywords = seo.keywords || '';
  const seoImage = seo.image || config.brandLogo || '';
  const seoOgType = seo.ogType || 'website';
  const seoTwitterCard =
    seo.twitterCard || (seoImage ? 'summary_large_image' : 'summary');

  const requestNotification = async () => {
    if (Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
  };

  useEffect(() => {
    requestNotification();

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', () => {
      window.history.pushState(null, '', window.location.href);
    });
  }, []);

  if (showCallUiPreview) {
    return <CallUiPreview />;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="absolute inset-0 overflow-hidden bg-slate-100 text-slate-800 dark:bg-spill-950 dark:text-white/90"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          dispatch(setModal({ target: '*' }));
        }
      }}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          dispatch(setModal({ target: '*' }));
        }
      }}
    >
      <div className="hidden md:block absolute top-0 left-0 right-0 h-28 bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-500 dark:from-spill-800 dark:via-spill-700 dark:to-spill-600" />
      <div className="relative w-full h-full md:p-5">
        <div className="relative w-full h-full overflow-hidden md:rounded-md md:shadow-2xl grid md:grid-cols-[480px_1fr] bg-white dark:bg-spill-900">
          <cont.foreground />
          <cont.room />
        </div>
      </div>

      <Helmet>
        <title>{seoTitle}</title>
        {seoDescription && <meta name="description" content={seoDescription} />}
        {seoKeywords && <meta name="keywords" content={seoKeywords} />}
        <meta property="og:title" content={seoTitle} />
        {seoDescription && <meta property="og:description" content={seoDescription} />}
        <meta property="og:type" content={seoOgType} />
        {seoImage && <meta property="og:image" content={seoImage} />}
        <meta name="twitter:card" content={seoTwitterCard} />
        <meta name="twitter:title" content={seoTitle} />
        {seoDescription && (
          <meta name="twitter:description" content={seoDescription} />
        )}
        {seoImage && <meta name="twitter:image" content={seoImage} />}
      </Helmet>

      <modal.signout />
      <modal.changePass />
      <modal.deleteAcc />
      <modal.qr />
      <modal.newContact />
      <modal.confirmNewGroup />
      <modal.avatarUpload />
      <modal.webcam />
      {imageCropper && <modal.imageCropper />}
      <modal.photoFull />
      <modal.confirmDeleteChat />
      <modal.sendFile />
      <AttachContactModal />
      <AttachPollModal />
      <AttachEventModal />
      <AttachStickerModal />
      <modal.confirmAddParticipant />
      <modal.editGroup />
      <modal.confirmExitGroup />
      <modal.confirmDeleteContact />
      <modal.confirmDeleteChatAndInbox />
      <ShareContactModal />
      <FeedbackModal />
      <CallPanel />
      <CallStart />
      <RoomAppearance />
    </div>
  );
}

export default Chat;
