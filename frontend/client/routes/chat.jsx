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
import CallStart from '../components/modals/callStart';
import CallUiPreview from '../components/mockups/callUiPreview';
import RoomAppearance from '../components/modals/roomAppearance';
import config from '../config';

function Chat() {
  const dispatch = useDispatch();
  const imageCropper = useSelector((state) => state.modal.imageCropper);
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

  useEffect(() => {
    // Browser notification permission is intentionally not requested during
    // application mount. The Notifications settings action owns that explicit
    // user gesture so browsers do not block or downgrade the permission prompt.
    const preserveChatHistory = () => {
      window.history.pushState(null, '', window.location.href);
    };

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', preserveChatHistory);

    return () => {
      window.removeEventListener('popstate', preserveChatHistory);
    };
  }, []);

  if (showCallUiPreview) {
    return <CallUiPreview />;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-syncchat-desktop-app
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
      <div
        data-syncchat-desktop-shell
        className="relative h-full w-full overflow-hidden grid md:grid-cols-[420px_minmax(0,1fr)] bg-white dark:bg-spill-900"
      >
        <cont.foreground />
        <cont.room />
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
      <CallStart />
      <RoomAppearance />
    </div>
  );
}

export default Chat;
