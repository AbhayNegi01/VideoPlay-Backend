import mongoose, {isValidObjectId} from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import ApiError from "../utils/ApiError.js"
import ApiResponse from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    //TODO: get all videos based on query, sort, pagination

    //console.log(req.query)
    const allVideos = await Video.aggregate([
        {
            $match: {
                $or: [
                    {title: { $regex: query, $options: "i" }}, 
                    {description: { $regex: query, $options: "i" }}
                ]
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            fullName: 1,
                            username: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                owner: {
                    $first: "$owner"
                }
            }
        },
        {
            $project: {
                thumbnail: 1,
                videoFile: 1,
                title: 1,
                description: 1,
                owner: 1
            }
        },
        {
            $sort: {
                [sortBy] : sortType === "asc" ? 1 : -1
            }
        },
        {
            $skip: (page - 1) * limit
        },
        {
            $limit: parseInt(limit)
        }
    ])

    return res
    .status(200)
    .json(new ApiResponse(200, allVideos, "fetched successfully"))
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body
    // TODO: get video, upload to cloudinary, create video

    if ( [title, description].some((field) => field?.trim() === "") ) {
        throw new ApiError(400, "All fields are required.")
    }

    const videoFileLocalPath = req.files?.videoFile[0]?.path
    const thumbnailLocalPath = req.files?.thumbnail[0]?.path

    if (!videoFileLocalPath || !thumbnailLocalPath) {
        throw new ApiError(400, "Video and thumbnail file is required to publish a video.")
    }

    const videoFile = await uploadOnCloudinary(videoFileLocalPath)
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

    if (!videoFile || !thumbnail) {
        throw new ApiError(500, "Failed to upload video or thumbnail file to Cloudinary.")
    }

    const video = await Video.create({
        title,
        description,
        videoFile: videoFile.url,
        thumbnail: thumbnail.url,
        duration: videoFile.duration,
        owner: req.user._id
    })

    if(!video) {
        throw new ApiError(500, "Something went wrong while uploading the video")
    }

    return res
    .status(200)
    .json(new ApiResponse(200, video, "Video uploaded successfully"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id

    if(!videoId.trim() || !isValidObjectId(videoId)) {
        throw new ApiError(400, "VideoId is required")
    }

    const video = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            fullName: 1,
                            username: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes"
            }
        },
        {
            $addFields: {
                owner: {
                    $first: "$owner"
                },
                likes: {
                    $size: "$likes"
                }
            }
        },
    ])

    if(!video?.length) {
        throw new ApiError(404, "video does not exist")
    }

    return res
    .status(200)
    .json(200, video, "Video fetched successfully")
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: update video details like title, description, thumbnail
    const { title, description } = req.body

    if(!videoId) {
        throw new ApiError(404, "Video not found");
    }

    const video = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                title,
                description,
            }
        },
        { new: true }
    )

    return res
    .status(200)
    .json(new ApiResponse(200, video, "Video details updated successfully"))
})

const updateVideoThumbnail = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: update video thumbnail
    const thumbnailLocalPath = req.file?.path;

    if(!thumbnailLocalPath) {
        throw new ApiError(400, "thumbnail file is missing")
    }

    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

    if(!thumbnail.url) {
        throw new ApiError(400, "Error while uploading the thumbnail")
    }

    const video = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                thumbnail: thumbnail.url
            }
        },
        { new: true }
    )

    return res
    .status(200)
    .json(new ApiResponse(200, video, "Video thumbnail updated successfully"))
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video

    if(!videoId) {
        throw new ApiError(404, "Video not found");
    }

    const deletedVideo = await Video.findByIdAndDelete(videoId)

    return res
    .status(200)
    .json(new ApiResponse(200, deletedVideo, "Video deleted successfully"))
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if(!videoId.trim() || isValidObjectId(videoId)) {
        throw new ApiError(400, "videoId is required.");
    }

    const video = await Video.findById(videoId);

    if(!video) {
        throw new ApiError(404, "Video not found.");
    }

    if(video.owner != req.user?._id) {
        throw new ApiError(401, "Unauthorised user");
    }

    video.isPublished = !(video.isPublished)
    await video.save();

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Toggled publish status successfully"))
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    updateVideoThumbnail,
    deleteVideo,
    togglePublishStatus
}