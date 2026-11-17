# meetup.com frontend GraphQL operations (snapshot)

Extracted from meetup.com's Next.js bundles (build `1b1d10811f94e8190d991ca4f061fb30ddeaa361`) on 2026-11-17 by `tools/meetup-capture/extract-site-queries.js`.
Regenerate after a new capture and diff this folder to see what Meetup changed. See ../README.md for how Rollcall uses these.

346 definitions: 158 queries, 124 mutations, 1 subscriptions, 63 fragments.
Operations marked **observed** were sent during the capture; the hash is the persisted-query SHA-256 the site sent instead of the query text.

## Queries

| Operation | Used by Rollcall | Observed | Persisted hash | Example variables |
|---|---|---|---|---|
| [bulkRemoveMembersCount](bulkRemoveMembersCount.graphql) |  |  |  |  |
| [checkoutPreview](checkoutPreview.graphql) |  |  |  |  |
| [eventByIdComments](eventByIdComments.graphql) | ✅ rollcallEventComments | **observed** (event-detail, event-comments) | `12d279050fd68e51…` | `{"eventId":"317182497","sortOrder":"DESC","first":3}` |
| [eventByIdPinnedComments](eventByIdPinnedComments.graphql) | ✅ rollcallEventPinnedComments | **observed** (event-detail) | `95f888c23dfbbc13…` | `{"eventId":"317182497"}` |
| [eventSearchWithSeries](eventSearchWithSeries.graphql) |  |  |  |  |
| [existingAlbums](existingAlbums.graphql) |  |  |  |  |
| [generateAttendanceQrCode](generateAttendanceQrCode.graphql) |  |  |  |  |
| [getAccountOrganizerSubscription](getAccountOrganizerSubscription.graphql) |  |  |  |  |
| [getAccountSettingsSelf](getAccountSettingsSelf.graphql) |  |  |  |  |
| [getAttendanceHistory](getAttendanceHistory.graphql) |  |  |  |  |
| [getAttendeesByIdForEventAttendees](getAttendeesByIdForEventAttendees.graphql) |  | **observed** (event-detail) | `91f3a9be979691de…` | `{"eventId":"316623743","first":3,"filter":{"rsvpStatus":["WAITLIST"]}}` |
| [getAttendeesByName](getAttendeesByName.graphql) |  |  |  |  |
| [getCity](getCity.graphql) |  |  |  |  |
| [getCommonGroups](getCommonGroups.graphql) |  |  |  |  |
| [getConversation](getConversation.graphql) |  |  |  |  |
| [getConversationByMemberId](getConversationByMemberId.graphql) |  |  |  |  |
| [getConversations](getConversations.graphql) |  |  |  |  |
| [getCurrencies](getCurrencies.graphql) |  |  |  |  |
| [getCustomQuestions](getCustomQuestions.graphql) |  |  |  |  |
| [getDiscountPercentage](getDiscountPercentage.graphql) |  |  |  |  |
| [getDiscussion](getDiscussion.graphql) |  |  |  |  |
| [getDiscussionCreator](getDiscussionCreator.graphql) |  |  |  |  |
| [getDraftGroupEvents](getDraftGroupEvents.graphql) |  |  |  |  |
| [getEventByIdForAttendees](getEventByIdForAttendees.graphql) | ✅ rollcallEventRsvps | **observed** (event-detail, event-attendees) | `cafa900bbe462e22…` | `{"eventId":"317182497","first":20,"filter":{"rsvpStatus":["YES","ATTENDED","NO_SHOW","EXCUSED_ABSENCE"]},"sort":null}` |
| [getEventByIdPhotoAlbum](getEventByIdPhotoAlbum.graphql) |  | **observed** (event-detail) | `f5b434f7d81e585e…` | `{"eventId":"317182497","number":6}` |
| [getEventCalendarUrlByEventId](getEventCalendarUrlByEventId.graphql) |  | **observed** (event-detail) | `246db165c8575cc0…` | `{"eventId":"317182497"}` |
| [getEventChatEventUrl](getEventChatEventUrl.graphql) |  |  |  |  |
| [getEventFeeSettings](getEventFeeSettings.graphql) |  |  |  |  |
| [getEventHomeClientOnly](getEventHomeClientOnly.graphql) |  | **observed** (event-detail) | `0f4b43ffe8c6ad6f…` | `{"eventId":"317182497"}` |
| [getEventInsights](getEventInsights.graphql) |  | **observed** (event-detail) | `653a1ef711d1d07a…` | `{"eventId":"317182497"}` |
| [getEventPageReviews](getEventPageReviews.graphql) |  |  |  |  |
| [getEventPromocode](getEventPromocode.graphql) |  |  |  |  |
| [getEventScheduleEventById](getEventScheduleEventById.graphql) |  |  |  |  |
| [getEventScheduleGroupByUrlname](getEventScheduleGroupByUrlname.graphql) |  |  |  |  |
| [getEventSeriesById](getEventSeriesById.graphql) |  | **observed** (event-detail) | `4c016453a9384eb5…` | `{"eventId":"317182497","numberOfEvents":10,"seriesStartDate":"2026-11-17"}` |
| [getEventsForLoggedOutHomepage](getEventsForLoggedOutHomepage.graphql) |  |  |  |  |
| [getEventsFromYourGroups](getEventsFromYourGroups.graphql) |  | **observed** (home) | `d482ec317a04ce4f…` | `{"first":15,"startDate":"2026-11-17T00:00:00Z"}` |
| [getFeedbackForEvent](getFeedbackForEvent.graphql) |  |  |  |  |
| [getForceOnboardingSelfData](getForceOnboardingSelfData.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `319c5083fdeb1848…` | `{}` |
| [getFriendshipStatus](getFriendshipStatus.graphql) |  |  |  |  |
| [getFriendUpcomingEvents](getFriendUpcomingEvents.graphql) |  |  |  |  |
| [getFundraiserForGroup](getFundraiserForGroup.graphql) |  | **observed** (events-listing, event-detail) | `acee9fe2e5c23ca2…` | `{"groupId":"37952124"}` |
| [getFundraisingSetupComplete](getFundraisingSetupComplete.graphql) |  |  |  |  |
| [getGroupDiscussions](getGroupDiscussions.graphql) |  |  |  |  |
| [getGroupDraft](getGroupDraft.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `e5f5669ae1b3b97c…` | `{}` |
| [getGroupDrafts](getGroupDrafts.graphql) |  |  |  |  |
| [getGroupFeedbackInfo](getGroupFeedbackInfo.graphql) |  |  |  |  |
| [getGroupFundraising](getGroupFundraising.graphql) |  |  |  |  |
| [getGroupGetStartedInfo](getGroupGetStartedInfo.graphql) |  |  |  |  |
| [getGroupId](getGroupId.graphql) |  |  |  |  |
| [getGroupLeadTeam](getGroupLeadTeam.graphql) |  |  |  |  |
| [getGroupMembers](getGroupMembers.graphql) |  |  |  |  |
| [getGroupMembershipStatus](getGroupMembershipStatus.graphql) |  | **observed** (event-detail) | `96bfae83b6890ea3…` | `{"urlname":"reston-pickup-soccer-rps"}` |
| [getGroupOrganizerEvents](getGroupOrganizerEvents.graphql) |  |  |  |  |
| [getGroupsLeadByMember](getGroupsLeadByMember.graphql) |  |  |  |  |
| [getGroupsLeadCountByMemberId](getGroupsLeadCountByMemberId.graphql) |  |  |  |  |
| [getGroupsOrganizedByMember](getGroupsOrganizedByMember.graphql) |  |  |  |  |
| [getGroupStartSubscriptionProfile](getGroupStartSubscriptionProfile.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `0379d49fcd4119b3…` | `{"tier":"LIGHT","pricePointIds":["918"]}` |
| [getHeaderSearchSuggestions](getHeaderSearchSuggestions.graphql) |  |  |  |  |
| [getHomepageSelfActiveGroups](getHomepageSelfActiveGroups.graphql) |  |  |  |  |
| [getHomepageSelfLeaderGroups](getHomepageSelfLeaderGroups.graphql) |  | **observed** (home) | `18644eb547c83ed3…` | `{"first":8}` |
| [getIsInCumulativeImpactTreatmentSegment](getIsInCumulativeImpactTreatmentSegment.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `6cc2d030d3e23bfd…` | `{}` |
| [getLandingPageEvents](getLandingPageEvents.graphql) |  |  |  |  |
| [getLastNetworkEventId](getLastNetworkEventId.graphql) |  |  |  |  |
| [getLastSentimentSurveyResponse](getLastSentimentSurveyResponse.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `d1bc4a51422f9c43…` | `{}` |
| [getLeaderGroupsWithDues](getLeaderGroupsWithDues.graphql) |  |  |  |  |
| [getLocationSearch](getLocationSearch.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `950b939f7033b268…` | `{"dataConfiguration":"{}","useImprovedGeoHashIndex":false,"sortByMaxDensity":false}` |
| [getMemberActionFirstOccurrence](getMemberActionFirstOccurrence.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `362feebc4d69e161…` | `{"action":"group_draft_completed"}` |
| [getMemberActionLastOccurrence](getMemberActionLastOccurrence.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `7dd7b8505f1ab973…` | `{"action":"onboarding_completed"}` |
| [getMemberCalendarExportUrls](getMemberCalendarExportUrls.graphql) |  |  |  |  |
| [getMemberGroups](getMemberGroups.graphql) |  |  |  |  |
| [getMemberInterests](getMemberInterests.graphql) |  |  |  |  |
| [getMemberPreferences](getMemberPreferences.graphql) |  | **observed** (home) | `667458fe685b7798…` | `{"names":["member_app_group_start_enrolled"]}` |
| [getMemberProfile](getMemberProfile.graphql) |  |  |  |  |
| [getMemberProfileTopics](getMemberProfileTopics.graphql) |  | **observed** (event-attendees) | `af56a2fddf5d8d8d…` | `{}` |
| [getMembersCounts](getMembersCounts.graphql) |  |  |  |  |
| [getMemberSubscription](getMemberSubscription.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `d50baa4cdcf30273…` | `{}` |
| [getMemberSubscriptionProfile](getMemberSubscriptionProfile.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `7677740075ba99de…` | `{"planNames":["monthly_1499_1w_trial_E8gdda","yearly_12999_1w_trial_hLr7PW"]}` |
| [getMessageReactors](getMessageReactors.graphql) |  |  |  |  |
| [getMyRsvps](getMyRsvps.graphql) |  |  |  |  |
| [getNetworkCustomQuestions](getNetworkCustomQuestions.graphql) |  |  |  |  |
| [getNetworkEventTimezones](getNetworkEventTimezones.graphql) |  |  |  |  |
| [getNewCityPageData](getNewCityPageData.graphql) |  |  |  |  |
| [getNewConvoMember](getNewConvoMember.graphql) |  |  |  |  |
| [getNotifications](getNotifications.graphql) |  |  |  |  |
| [getOrganizerCommonGroups](getOrganizerCommonGroups.graphql) |  |  |  |  |
| [getOrganizerSubscription](getOrganizerSubscription.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `ae21892ff70d4aba…` | `{}` |
| [getOrganizerSubscriptionProfile](getOrganizerSubscriptionProfile.graphql) |  |  |  |  |
| [getPastGroupEvents](getPastGroupEvents.graphql) | ✅ rollcallGroupEvents (status filter differs) | **observed** (events-listing) | `7ee35e6c00aafa75…` | `{"urlname":"reston-pickup-soccer-rps","beforeDateTime":"2026-11-17T15:09:59.316Z"}` |
| [getPaypalMerchantAccount](getPaypalMerchantAccount.graphql) |  |  |  |  |
| [getPeers](getPeers.graphql) |  |  |  |  |
| [getPendingCommonGroups](getPendingCommonGroups.graphql) |  |  |  |  |
| [getPendingFriendRequest](getPendingFriendRequest.graphql) |  |  |  |  |
| [getPersonalSettings](getPersonalSettings.graphql) |  |  |  |  |
| [getPlatformFeeForEvent](getPlatformFeeForEvent.graphql) |  |  |  |  |
| [getProfilePhotos](getProfilePhotos.graphql) |  |  |  |  |
| [getProNetworkEventGroups](getProNetworkEventGroups.graphql) |  |  |  |  |
| [getProNetworkPaymentStatusByGroup](getProNetworkPaymentStatusByGroup.graphql) |  |  |  |  |
| [getReachableMembersCount](getReachableMembersCount.graphql) |  |  |  |  |
| [getRecentEventForFeedback](getRecentEventForFeedback.graphql) |  | **observed** (home) | `6aeec20115392a34…` | `{}` |
| [getRecentGroupVenues](getRecentGroupVenues.graphql) |  |  |  |  |
| [getRecommendedGroups](getRecommendedGroups.graphql) |  |  |  |  |
| [getSavedEvents](getSavedEvents.graphql) |  |  |  |  |
| [getSavedEventsDates](getSavedEventsDates.graphql) |  |  |  |  |
| [getSelf](getSelf.graphql) | ✅ rollcallSelf | **observed** (home, events-listing, event-detail, event-attendees) | `48e9b60147af23d0…` | `{}` |
| [getSelfActiveGroups](getSelfActiveGroups.graphql) |  |  |  |  |
| [getSelfGetStartedInfo](getSelfGetStartedInfo.graphql) |  |  |  |  |
| [getSelfLeaderGroups](getSelfLeaderGroups.graphql) |  |  |  |  |
| [getSelfOrganizedGroupIds](getSelfOrganizedGroupIds.graphql) |  |  |  |  |
| [getSelfPendingGroups](getSelfPendingGroups.graphql) |  |  |  |  |
| [getSelfSubscriptionProfile](getSelfSubscriptionProfile.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `534ac0b4bbed7ac5…` | `{"tier":"PRO","pricePointIds":["24","25"]}` |
| [getSidebarInfo](getSidebarInfo.graphql) |  |  |  |  |
| [getStepUpGroups](getStepUpGroups.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `0dd0ec854cc715ff…` | `{}` |
| [getStreamLink](getStreamLink.graphql) |  |  |  |  |
| [getSubscriptionCancelSubscriptionProfile](getSubscriptionCancelSubscriptionProfile.graphql) |  |  |  |  |
| [getSuggestedEvents](getSuggestedEvents.graphql) |  | **observed** (home) | `b583b08c0b708a5d…` | `{"first":15,"lat":"<redacted>","lon":"<redacted>","startDateRange":"2026-11-17T12:09:55-05:00[US/Eastern]","indexAlias":` |
| [getSuggestedTopics](getSuggestedTopics.graphql) |  |  |  |  |
| [getSuggestedTopicsSearch](getSuggestedTopicsSearch.graphql) |  |  |  |  |
| [getSupergroupCandidate](getSupergroupCandidate.graphql) |  |  |  |  |
| [getSupergroupCandidates](getSupergroupCandidates.graphql) |  |  |  |  |
| [getTemplatesForModal](getTemplatesForModal.graphql) |  |  |  |  |
| [getTemporaryMemberPreferences](getTemporaryMemberPreferences.graphql) |  | **observed** (home) | `e3827627e3895b15…` | `{"names":[]}` |
| [getThirdPartyRegistrantInfo](getThirdPartyRegistrantInfo.graphql) |  |  |  |  |
| [getUpcomingGroupEvents](getUpcomingGroupEvents.graphql) | ✅ rollcallGroupEvents | **observed** (events-listing) | `81a7529c2bcfd873…` | `{"urlname":"reston-pickup-soccer-rps","afterDateTime":"2026-11-17T15:09:59.316Z"}` |
| [getUpcomingRsvps](getUpcomingRsvps.graphql) |  | **observed** (event-detail) | `9bd90b24af91f0ee…` | `{"startDate":"2026-11-17T00:00:00.000Z","endDate":"2026-11-18T03:00:00.000Z"}` |
| [getYesRsvpsCount](getYesRsvpsCount.graphql) |  | **observed** (home) | `798cf41e12e97e32…` | `{"startDate":"2026-07-28T04:00:00.000Z","endDate":"2026-11-17T05:00:00.000Z"}` |
| [getYourDraftEvents](getYourDraftEvents.graphql) |  |  |  |  |
| [getYourEventsPastEvents](getYourEventsPastEvents.graphql) |  |  |  |  |
| [getYourEventsSaved](getYourEventsSaved.graphql) |  |  |  |  |
| [getYourMemberEvents](getYourMemberEvents.graphql) |  |  |  |  |
| [getYourRsvps](getYourRsvps.graphql) |  | **observed** (home) | `a09407c3c9830c6f…` | `{"first":2,"sort":{"sortField":"DATETIME","sortOrder":"ASC"},"eventStatus":["UPCOMING"],"rsvpStatus":["YES"]}` |
| [getYourUpcomingEvents](getYourUpcomingEvents.graphql) |  |  |  |  |
| [getZoomAuthorization](getZoomAuthorization.graphql) |  |  |  |  |
| [groupAdDisplayStatus](groupAdDisplayStatus.graphql) |  | **observed** (events-listing, event-detail) | `cae6ef74d4a67bcc…` | `{"input":{"groupId":"37952124","oneTrustActiveGroupsValue":",OSSTA_BG,C0004,C0002,"}}` |
| [groupAlbum](groupAlbum.graphql) |  |  |  |  |
| [groupHome](groupHome.graphql) |  |  |  |  |
| [groupHomeDynamic](groupHomeDynamic.graphql) |  |  |  |  |
| [groupHomeEvents](groupHomeEvents.graphql) |  |  |  |  |
| [groupHomeHeader](groupHomeHeader.graphql) |  |  |  |  |
| [groupSearch](groupSearch.graphql) |  |  |  |  |
| [groupSimilarEvents](groupSimilarEvents.graphql) |  | **observed** (events-listing, event-detail) | `67d839e00d28a008…` | `{"takeEvents":4,"lat":"<redacted>","lon":"<redacted>","topicId":"482","dataConfiguration":"{\"isSimplifiedSearchEnabled\` |
| [groupSimilarEventsByEvent](groupSimilarEventsByEvent.graphql) |  | **observed** (events-listing, event-detail) | `36b0a51e81fd233c…` | `{"takeEvents":4,"eventId":"317130890","dataConfiguration":"{\"isSimplifiedSearchEnabled\": true, \"include_events_from_u` |
| [hasUserRsvps](hasUserRsvps.graphql) |  | **observed** (home) | `096a4738e4473d8f…` | `{}` |
| [lastGroupPhotos](lastGroupPhotos.graphql) |  |  |  |  |
| [locationNoop](locationNoop.graphql) |  |  |  |  |
| [myFeedback](myFeedback.graphql) |  |  |  |  |
| [proGroups](proGroups.graphql) |  |  |  |  |
| [proNetworkGroupsSearch](proNetworkGroupsSearch.graphql) |  |  |  |  |
| [proOrgsGroups](proOrgsGroups.graphql) |  |  |  |  |
| [recommendedEventsWithSeries](recommendedEventsWithSeries.graphql) |  |  |  |  |
| [requireCaptcha](requireCaptcha.graphql) |  |  |  |  |
| [searchGroupMembershipsByName](searchGroupMembershipsByName.graphql) |  |  |  |  |
| [searchTopics](searchTopics.graphql) |  |  |  |  |
| [suggestVenues](suggestVenues.graphql) |  |  |  |  |
| [termsDueByLocation](termsDueByLocation.graphql) |  |  |  |  |
| [trustpilotEmbedUrl](trustpilotEmbedUrl.graphql) |  |  |  |  |
| [unreadMessages](unreadMessages.graphql) |  | **observed** (home, events-listing, event-detail, event-attendees) | `141109d921a5d34b…` | `{}` |
| [WritePhotoInfo](WritePhotoInfo.graphql) |  |  |  |  |

## Mutations

| Operation | Used by Rollcall | Observed | Persisted hash | Example variables |
|---|---|---|---|---|
| [acceptFriendRequest](acceptFriendRequest.graphql) |  |  |  |  |
| [acceptTerms](acceptTerms.graphql) |  |  |  |  |
| [addComment](addComment.graphql) |  |  |  |  |
| [addCommentReply](addCommentReply.graphql) |  |  |  |  |
| [addDirectMessageReaction](addDirectMessageReaction.graphql) |  |  |  |  |
| [addHosts](addHosts.graphql) |  |  |  |  |
| [announceEvent](announceEvent.graphql) |  |  |  |  |
| [approveGroupMembership](approveGroupMembership.graphql) |  |  |  |  |
| [blockMember](blockMember.graphql) |  |  |  |  |
| [bulkRemoveMembers](bulkRemoveMembers.graphql) |  |  |  |  |
| [cancelFriendRequest](cancelFriendRequest.graphql) |  |  |  |  |
| [cancelOrganizerSubscription](cancelOrganizerSubscription.graphql) |  |  |  |  |
| [captureEventFeePayment](captureEventFeePayment.graphql) |  |  |  |  |
| [checkSiftVerificationCode](checkSiftVerificationCode.graphql) |  |  |  |  |
| [closeEventRsvps](closeEventRsvps.graphql) |  |  |  |  |
| [copyGroupBulkPhoto](copyGroupBulkPhoto.graphql) |  |  |  |  |
| [createConversation](createConversation.graphql) |  |  |  |  |
| [createDiscussion](createDiscussion.graphql) |  |  |  |  |
| [createDiscussionComment](createDiscussionComment.graphql) |  |  |  |  |
| [createEvent](createEvent.graphql) |  |  |  |  |
| [createEventFeeOrder](createEventFeeOrder.graphql) |  |  |  |  |
| [createEventZoomMeeting](createEventZoomMeeting.graphql) |  |  |  |  |
| [createFundraiserForGroup](createFundraiserForGroup.graphql) |  |  |  |  |
| [createGroupBulkPhoto](createGroupBulkPhoto.graphql) |  |  |  |  |
| [createGroupLedger](createGroupLedger.graphql) |  |  |  |  |
| [createMessage](createMessage.graphql) |  |  |  |  |
| [createNetworkEventFilter](createNetworkEventFilter.graphql) |  |  |  |  |
| [createVenue](createVenue.graphql) |  |  |  |  |
| [declineGroupMembership](declineGroupMembership.graphql) |  |  |  |  |
| [deleteComment](deleteComment.graphql) |  |  |  |  |
| [deleteCommentReply](deleteCommentReply.graphql) |  |  |  |  |
| [deleteDirectMessage](deleteDirectMessage.graphql) |  |  |  |  |
| [deleteDiscussion](deleteDiscussion.graphql) |  |  |  |  |
| [deleteDiscussionComment](deleteDiscussionComment.graphql) |  |  |  |  |
| [deleteEvent](deleteEvent.graphql) |  |  |  |  |
| [deleteEventZoomMeeting](deleteEventZoomMeeting.graphql) |  |  |  |  |
| [deleteGroupDraft](deleteGroupDraft.graphql) |  |  |  |  |
| [deleteGroupMembership](deleteGroupMembership.graphql) |  |  |  |  |
| [editDirectMessage](editDirectMessage.graphql) |  |  |  |  |
| [editEvent](editEvent.graphql) |  |  |  |  |
| [editRsvp](editRsvp.graphql) |  |  |  |  |
| [featureEvent](featureEvent.graphql) |  |  |  |  |
| [followDiscussion](followDiscussion.graphql) |  |  |  |  |
| [generateEventAttendeesReport](generateEventAttendeesReport.graphql) |  |  |  |  |
| [GenerateGroupAttendanceReport](GenerateGroupAttendanceReport.graphql) |  |  |  |  |
| [generateGroupEventUploadUrl](generateGroupEventUploadUrl.graphql) |  |  |  |  |
| [generateGroupMembersReport](generateGroupMembersReport.graphql) |  |  |  |  |
| [generateMemberProfilePhotoUploadUrl](generateMemberProfilePhotoUploadUrl.graphql) |  |  |  |  |
| [issueNetworkTicket](issueNetworkTicket.graphql) |  |  |  |  |
| [joinGroup](joinGroup.graphql) |  |  |  |  |
| [leaveConversation](leaveConversation.graphql) |  |  |  |  |
| [likeComment](likeComment.graphql) |  |  |  |  |
| [likeCommentReply](likeCommentReply.graphql) |  |  |  |  |
| [likeDiscussion](likeDiscussion.graphql) |  |  |  |  |
| [likeDiscussionComment](likeDiscussionComment.graphql) |  |  |  |  |
| [login](login.graphql) |  |  |  |  |
| [loginWithThirdPartyService](loginWithThirdPartyService.graphql) |  |  |  |  |
| [makeCommentPrivate](makeCommentPrivate.graphql) |  |  |  |  |
| [makeCommentPublic](makeCommentPublic.graphql) |  |  |  |  |
| [markAllNotificationsClicked](markAllNotificationsClicked.graphql) |  |  |  |  |
| [markAsReadAllConversations](markAsReadAllConversations.graphql) |  |  |  |  |
| [markGroupMemberAsActive](markGroupMemberAsActive.graphql) |  | **observed** (events-listing, event-detail, event-attendees) | `41073f7c6956592c…` | `{"groupId":"37952124"}` |
| [markNotificationClicked](markNotificationClicked.graphql) |  |  |  |  |
| [markNotificationRead](markNotificationRead.graphql) |  |  |  |  |
| [markSuperOrganizerNotificationShown](markSuperOrganizerNotificationShown.graphql) |  |  |  |  |
| [openEventRsvps](openEventRsvps.graphql) |  |  |  |  |
| [pinComment](pinComment.graphql) |  |  |  |  |
| [proNetworkGroupsReport](proNetworkGroupsReport.graphql) |  |  |  |  |
| [publishEventDraft](publishEventDraft.graphql) |  |  |  |  |
| [readConvo](readConvo.graphql) |  |  |  |  |
| [recordEventPayment](recordEventPayment.graphql) |  |  |  |  |
| [recordMemberAction](recordMemberAction.graphql) |  |  |  |  |
| [refreshTokensMutation](refreshTokensMutation.graphql) | ✅ refreshTokensMutation (verbatim) |  |  |  |
| [registerMemberWithEmail](registerMemberWithEmail.graphql) |  |  |  |  |
| [registerMemberWithThirdPartyService](registerMemberWithThirdPartyService.graphql) |  |  |  |  |
| [rejectFriendRequest](rejectFriendRequest.graphql) |  |  |  |  |
| [removeDirectMessageReaction](removeDirectMessageReaction.graphql) |  |  |  |  |
| [removeFriend](removeFriend.graphql) |  |  |  |  |
| [removeHosts](removeHosts.graphql) |  |  |  |  |
| [removeMemberPhotos](removeMemberPhotos.graphql) |  |  |  |  |
| [reportAbuse](reportAbuse.graphql) |  |  |  |  |
| [resendVerificationCode](resendVerificationCode.graphql) |  |  |  |  |
| [respondToSentimentSurvey](respondToSentimentSurvey.graphql) |  |  |  |  |
| [reverifyMember](reverifyMember.graphql) |  |  |  |  |
| [rsvpToEvent](rsvpToEvent.graphql) |  |  |  |  |
| [saveGroupQuestions](saveGroupQuestions.graphql) |  |  |  |  |
| [saveNetworkQuestions](saveNetworkQuestions.graphql) |  |  |  |  |
| [saveSubscriptionCancelReasons](saveSubscriptionCancelReasons.graphql) |  |  |  |  |
| [saveUnifiedEvent](saveUnifiedEvent.graphql) |  |  |  |  |
| [sendForgotPasswordEmail](sendForgotPasswordEmail.graphql) |  |  |  |  |
| [sendFriendRequest](sendFriendRequest.graphql) |  |  |  |  |
| [sendMemberEmail](sendMemberEmail.graphql) |  |  |  |  |
| [submitFeedback](submitFeedback.graphql) |  |  |  |  |
| [suppressFeedback](suppressFeedback.graphql) |  |  |  |  |
| [takeAttendance](takeAttendance.graphql) |  |  |  |  |
| [unblockMember](unblockMember.graphql) |  |  |  |  |
| [unfeatureEvent](unfeatureEvent.graphql) |  |  |  |  |
| [unfollowDiscussion](unfollowDiscussion.graphql) |  |  |  |  |
| [unlikeComment](unlikeComment.graphql) |  |  |  |  |
| [unlikeCommentReply](unlikeCommentReply.graphql) |  |  |  |  |
| [unlikeDiscussion](unlikeDiscussion.graphql) |  |  |  |  |
| [unlikeDiscussionComment](unlikeDiscussionComment.graphql) |  |  |  |  |
| [unpauseStripeMemberSubscription](unpauseStripeMemberSubscription.graphql) |  |  |  |  |
| [unpinComment](unpinComment.graphql) |  |  |  |  |
| [unsaveUnifiedEvent](unsaveUnifiedEvent.graphql) |  |  |  |  |
| [updateConversation](updateConversation.graphql) |  |  |  |  |
| [updateDiscussion](updateDiscussion.graphql) |  |  |  |  |
| [updateDiscussionComment](updateDiscussionComment.graphql) |  |  |  |  |
| [updateDiscussionPreference](updateDiscussionPreference.graphql) |  |  |  |  |
| [updateFeedback](updateFeedback.graphql) |  |  |  |  |
| [updateGroup](updateGroup.graphql) |  |  |  |  |
| [updateGroupDuesExemptionStatus](updateGroupDuesExemptionStatus.graphql) |  |  |  |  |
| [updateGroupMemberRole](updateGroupMemberRole.graphql) |  |  |  |  |
| [updateGroupMembershipRole](updateGroupMembershipRole.graphql) |  |  |  |  |
| [updateGroupProRsvpSurveySettings](updateGroupProRsvpSurveySettings.graphql) |  |  |  |  |
| [updateLifeStages](updateLifeStages.graphql) |  |  |  |  |
| [updateMemberAccount](updateMemberAccount.graphql) |  |  |  |  |
| [updateMemberPreferences](updateMemberPreferences.graphql) |  |  |  |  |
| [updateNetworkSettings](updateNetworkSettings.graphql) |  |  |  |  |
| [updateNetworkTies](updateNetworkTies.graphql) |  |  |  |  |
| [updateOrganizerSubscription](updateOrganizerSubscription.graphql) |  |  |  |  |
| [updatePrivateVenue](updatePrivateVenue.graphql) |  |  |  |  |
| [updateProNetworkGroups](updateProNetworkGroups.graphql) |  |  |  |  |
| [updateTemporaryMemberPreference](updateTemporaryMemberPreference.graphql) |  |  |  |  |

## Subscriptions

| Operation | Used by Rollcall | Observed | Persisted hash | Example variables |
|---|---|---|---|---|
| [convoActions](convoActions.graphql) |  |  |  |  |

## Fragments

| Fragment | Used by Rollcall |
|---|---|
| [AlbumPhoto](AlbumPhoto.graphql) |  |
| [AttendeesRsvp](AttendeesRsvp.graphql) | ✅ rollcallEventRsvps |
| [BuildMeetupGroupSearch](BuildMeetupGroupSearch.graphql) |  |
| [ConversationFragment](ConversationFragment.graphql) |  |
| [ConvoMember](ConvoMember.graphql) |  |
| [CoreGroupHomeEvent](CoreGroupHomeEvent.graphql) | ✅ RollcallEvent fragment |
| [CoreGroupHomeEventPublic](CoreGroupHomeEventPublic.graphql) |  |
| [CoreGroupHomeMember](CoreGroupHomeMember.graphql) |  |
| [CoreGroupHomeMemberMetadata](CoreGroupHomeMemberMetadata.graphql) |  |
| [Error](Error.graphql) |  |
| [EventByIdComment](EventByIdComment.graphql) | ✅ rollcallEventComments |
| [EventByIdForAttendees](EventByIdForAttendees.graphql) | ✅ rollcallEventRsvps |
| [EventByIdPhotoAlbum](EventByIdPhotoAlbum.graphql) |  |
| [EventCommentEdge](EventCommentEdge.graphql) | ✅ rollcallEventComments |
| [EventDetails](EventDetails.graphql) |  |
| [EventForCard](EventForCard.graphql) |  |
| [EventForCardRsvpEdge](EventForCardRsvpEdge.graphql) |  |
| [EventForGuestCard](EventForGuestCard.graphql) |  |
| [EventHomeClientOnly](EventHomeClientOnly.graphql) |  |
| [EventPageReview](EventPageReview.graphql) |  |
| [EventScheduleEvent](EventScheduleEvent.graphql) |  |
| [EventScheduleGroup](EventScheduleGroup.graphql) |  |
| [EventSeries](EventSeries.graphql) |  |
| [FindEventInfo](FindEventInfo.graphql) |  |
| [GroupDiscussion](GroupDiscussion.graphql) |  |
| [GroupDiscussionComment](GroupDiscussionComment.graphql) |  |
| [GroupFeedbackInfo](GroupFeedbackInfo.graphql) |  |
| [GroupForEventForCard](GroupForEventForCard.graphql) |  |
| [GroupHomeEvent](GroupHomeEvent.graphql) |  |
| [GroupHomeFutureEvents](GroupHomeFutureEvents.graphql) |  |
| [GroupHomeHeaderData](GroupHomeHeaderData.graphql) |  |
| [GroupHomeMember](GroupHomeMember.graphql) |  |
| [GroupProNetworkMap](GroupProNetworkMap.graphql) |  |
| [GroupsPageGroup2](GroupsPageGroup2.graphql) |  |
| [HomepageEventDetails](HomepageEventDetails.graphql) |  |
| [HomepageSelfGroup](HomepageSelfGroup.graphql) |  |
| [LandingPageEvent](LandingPageEvent.graphql) |  |
| [LocalConversation](LocalConversation.graphql) |  |
| [LocalMemberMessage](LocalMemberMessage.graphql) |  |
| [LocalReactionEventMessage](LocalReactionEventMessage.graphql) |  |
| [MemberProfileGroups](MemberProfileGroups.graphql) |  |
| [MemberSubscriptionDetails](MemberSubscriptionDetails.graphql) |  |
| [NewGroupSearch](NewGroupSearch.graphql) |  |
| [OAuthClientFragment](OAuthClientFragment.graphql) |  |
| [PaymentReceivedFromMember](PaymentReceivedFromMember.graphql) |  |
| [PopularGroupSearch](PopularGroupSearch.graphql) |  |
| [ProGroupSearch](ProGroupSearch.graphql) |  |
| [Question](Question.graphql) |  |
| [RsvpsForCard](RsvpsForCard.graphql) |  |
| [SavedEvent](SavedEvent.graphql) |  |
| [SocialProofInsightsForCard](SocialProofInsightsForCard.graphql) |  |
| [SocialProofInsightsForGroupHome](SocialProofInsightsForGroupHome.graphql) |  |
| [Sponsor](Sponsor.graphql) |  |
| [SubscriptionCancelCurrentSubscription](SubscriptionCancelCurrentSubscription.graphql) |  |
| [SubscriptionCancelPlan](SubscriptionCancelPlan.graphql) |  |
| [SubscriptionCancelPromotion](SubscriptionCancelPromotion.graphql) |  |
| [SubscriptionCancelPromotionDiscount](SubscriptionCancelPromotionDiscount.graphql) |  |
| [SubscriptionCancelSubscriptionProfile](SubscriptionCancelSubscriptionProfile.graphql) |  |
| [SupergroupCandidate](SupergroupCandidate.graphql) |  |
| [TicketsConnection](TicketsConnection.graphql) |  |
| [Topic](Topic.graphql) |  |
| [UpcomingEventDetails](UpcomingEventDetails.graphql) |  |
| [VenueDetails](VenueDetails.graphql) |  |
