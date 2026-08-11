import { User } from "../users/user.entity";
import { TopicResponse, topicResponse } from "../topics/topic-response";
import { Task } from "./task.entity";

export type TaskResponse = Omit<Task, "topic"> & {
  topic: TopicResponse | null;
};

export function taskResponse(task: Task, viewer: User): TaskResponse {
  return {
    ...task,
    topic: task.topic ? topicResponse(task.topic, viewer) : null,
  };
}
