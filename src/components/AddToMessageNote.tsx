/**
 * The note beside the navigation while a choice is being added to the message
 * (src/utils/addToMessage.ts): what will happen to the choice, and the end of the
 * message it joins. GlobalNavBar places it in the free space left of the navigation,
 * so no screen's layout moves, and it is never a gaze target.
 */
import React from 'react';
import { messageTail } from '../utils/addToMessage';

const AddToMessageNote: React.FC<{ text: string }> = ({ text }) => {
  const tail = messageTail(text, 34);
  return (
    <div className="add-message-note" role="status" aria-live="polite">
      <span className="add-message-note-title">Adding to your message</span>
      {tail && <span className="add-message-note-text">{tail}</span>}
    </div>
  );
};

export default React.memo(AddToMessageNote);
